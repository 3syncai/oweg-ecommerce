"use strict";
/**
 * 📸 Product Image Organizer - Move uploaded images to proper folders
 *
 * Automatically organizes product images into structured folders:
 * - product/{exact_product_name}/image_1.png (no collection/brand)
 * - product/{brand_name}/{exact_product_name}/image_1.png (with brand/collection)
 *
 * Matches the folder structure from upload-images-to-s3.js
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.productS3FolderCache = void 0;
exports.default = productImageOrganizer;
const client_s3_1 = require("@aws-sdk/client-s3");
// Load S3 configuration from environment variables
const BUCKET = process.env.S3_BUCKET || "";
const REGION = process.env.S3_REGION || "ap-south-1";
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID || "";
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY || "";
const s3 = new client_s3_1.S3Client({
    region: REGION,
    credentials: {
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
    },
});
// Global cache: Map product ID to S3 folder path
// This will be used by the deletion subscriber
exports.productS3FolderCache = new Map();
/**
 * Sanitize brand name (lowercase, hyphenated) - matches upload script
 */
function sanitizeBrandName(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50)
        .replace(/-+$/, "");
}
/**
 * Sanitize product name (exact name with minimal changes) - matches upload script
 */
function sanitizeProductName(name) {
    return name
        .trim()
        // Only replace truly problematic characters for S3: / \ ? * : | " < >
        .replace(/[\/\\?*:|"<>]/g, "-")
        .replace(/^[\s-]+|[\s-]+$/g, "")
        .slice(0, 100);
}
async function objectExists(key) {
    try {
        await s3.send(new client_s3_1.HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        return true;
    }
    catch {
        return false;
    }
}
async function moveS3Object(oldKey, newKey, logger) {
    try {
        logger.info(`🔍 Step 1: Checking if source file exists: ${oldKey}`);
        const sourceExists = await objectExists(oldKey);
        if (!sourceExists) {
            logger.error(`❌ Source file DOES NOT EXIST in S3: ${oldKey}`);
            return false;
        }
        logger.info(`✅ Source file EXISTS: ${oldKey}`);
        logger.info(`🔍 Step 2: Checking if destination exists: ${newKey}`);
        if (await objectExists(newKey)) {
            logger.info(`✅ Destination already exists: ${newKey}`);
            return true;
        }
        logger.info(`✅ Destination does not exist, will create: ${newKey}`);
        logger.info(`📋 Step 3: Copying from ${oldKey} to ${newKey}`);
        await s3.send(new client_s3_1.CopyObjectCommand({
            Bucket: BUCKET,
            CopySource: `${BUCKET}/${oldKey}`,
            Key: newKey,
        }));
        logger.info(`✅ Copy successful! File now at: ${newKey}`);
        logger.info(`🗑️  Step 4: Deleting old file: ${oldKey}`);
        try {
            await s3.send(new client_s3_1.DeleteObjectCommand({
                Bucket: BUCKET,
                Key: oldKey,
            }));
            logger.info(`✅ Old file deleted successfully: ${oldKey}`);
        }
        catch (deleteError) {
            logger.warn(`⚠️  Could not delete old file ${oldKey}: ${deleteError.message}`);
            // Don't fail if delete fails - file is already copied
        }
        logger.info(`🎉 SUCCESS: File moved from ${oldKey} to ${newKey}`);
        return true;
    }
    catch (error) {
        logger.error(`❌ CRITICAL ERROR moving ${oldKey} to ${newKey}`);
        logger.error(`Error name: ${error.name}`);
        logger.error(`Error message: ${error.message}`);
        logger.error(`Error code: ${error.Code || 'N/A'}`);
        logger.error(`Full error: ${JSON.stringify(error, null, 2)}`);
        return false;
    }
}
function extractS3Key(url, logger) {
    try {
        if (logger)
            logger.info(`🔍 Extracting S3 key from URL: ${url}`);
        // Handle different S3 URL formats
        // Format 1: https://bucket.s3.region.amazonaws.com/key
        if (url.includes(`${BUCKET}.s3.${REGION}.amazonaws.com/`)) {
            const key = url.split(`${BUCKET}.s3.${REGION}.amazonaws.com/`)[1];
            logger.info(`✅ Extracted key (format 1): ${key}`);
            return key;
        }
        // Format 2: https://bucket.s3.amazonaws.com/key
        if (url.includes(`${BUCKET}.s3.amazonaws.com/`)) {
            const key = url.split(`${BUCKET}.s3.amazonaws.com/`)[1];
            logger.info(`✅ Extracted key (format 2): ${key}`);
            return key;
        }
        // Format 3: https://s3.region.amazonaws.com/bucket/key
        if (url.includes(`s3.${REGION}.amazonaws.com/${BUCKET}/`)) {
            const key = url.split(`s3.${REGION}.amazonaws.com/${BUCKET}/`)[1];
            logger.info(`✅ Extracted key (format 3): ${key}`);
            return key;
        }
        // Format 4: https://s3.amazonaws.com/bucket/key
        if (url.includes("s3.amazonaws.com/")) {
            const parts = url.split("s3.amazonaws.com/");
            if (parts[1]) {
                // Remove bucket name from path if present
                const pathParts = parts[1].split("/");
                if (pathParts[0] === BUCKET) {
                    const key = pathParts.slice(1).join("/");
                    logger.info(`✅ Extracted key (format 4): ${key}`);
                    return key;
                }
                // If no bucket in path, return everything after s3.amazonaws.com/
                const key = parts[1];
                logger.info(`✅ Extracted key (format 4, no bucket): ${key}`);
                return key;
            }
        }
        logger.warn(`❌ Could not extract S3 key from URL: ${url}`);
        return null;
    }
    catch (error) {
        logger.error(`❌ Error extracting S3 key: ${error.message}`);
        return null;
    }
}
async function productImageOrganizer({ event: { data }, container, }) {
    const productService = container.resolve("product");
    const logger = container.resolve("logger");
    logger.info(`🚀 PRODUCT IMAGE ORGANIZER TRIGGERED for product ID: ${data.id}`);
    try {
        // Skip if S3 not configured
        if (!ACCESS_KEY || !SECRET_KEY || !BUCKET) {
            logger.error("❌ S3 not configured! ACCESS_KEY, SECRET_KEY, or BUCKET missing");
            return;
        }
        logger.info(`✅ S3 configured: BUCKET=${BUCKET}, REGION=${REGION}`);
        // Wait longer for images to be uploaded to S3 (especially for 1-2 images)
        logger.info(`⏳ Waiting 5 seconds for images to be uploaded to S3...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Retrieve product with images - retry if needed
        let product;
        let retries = 3;
        while (retries > 0) {
            try {
                product = await productService.retrieveProduct(data.id, {
                    relations: ["images", "collection"],
                });
                if (product?.images?.length) {
                    break;
                }
            }
            catch (error) {
                logger.warn(`Retry ${4 - retries}: ${error.message}`);
            }
            if (!product?.images?.length && retries > 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            retries--;
        }
        if (!product) {
            try {
                product = await productService.retrieveProduct(data.id);
            }
            catch (error) {
                logger.error(`Failed to retrieve product ${data.id}: ${error.message}`);
                return;
            }
        }
        if (!product?.images?.length) {
            logger.info(`Product ${product?.title || data.id} has no images, skipping`);
            return;
        }
        logger.info(`🔍 Found ${product.images.length} image(s) for product: ${product.title}`);
        // Get collection name
        let collectionName = null;
        if (product.collection_id) {
            try {
                const collectionService = container.resolve("productCollection");
                const collection = await collectionService.retrieveCollection(product.collection_id);
                collectionName = collection?.title || collection?.handle || null;
            }
            catch {
                try {
                    const collectionService = container.resolve("collection");
                    const collection = await collectionService.retrieve(product.collection_id);
                    collectionName = collection?.title || collection?.handle || null;
                }
                catch {
                    if (product.collection) {
                        collectionName = product.collection?.title || null;
                    }
                }
            }
        }
        const productName = sanitizeProductName(product.title || `product-${product.id}`);
        const newUrls = [];
        let movedCount = 0;
        let skippedCount = 0;
        logger.info(`📂 Organizing images for: ${product.title}${collectionName ? ` (Brand: ${collectionName})` : ""}`);
        for (let i = 0; i < product.images.length; i++) {
            const image = product.images[i];
            const imageUrl = typeof image === "string" ? image : image?.url;
            if (!imageUrl) {
                logger.warn(`Image ${i + 1} has no URL, skipping`);
                newUrls.push(imageUrl);
                skippedCount++;
                continue;
            }
            // Log the image URL for debugging
            logger.info(`📷 Image ${i + 1} URL: ${imageUrl}`);
            logger.info(`🔍 Checking if URL contains 's3.amazonaws.com': ${imageUrl.includes("s3.amazonaws.com")}`);
            logger.info(`🔍 Checking if URL contains 's3.${REGION}.amazonaws.com': ${imageUrl.includes(`s3.${REGION}.amazonaws.com`)}`);
            // Only process S3 URLs - check for s3.amazonaws.com in URL
            const hasS3Amazonaws = imageUrl.includes("s3.amazonaws.com");
            const hasS3Region = imageUrl.includes(`s3.${REGION}.amazonaws.com`);
            const isS3Url = hasS3Amazonaws || hasS3Region;
            logger.info(`🔍 isS3Url result: ${isS3Url} (hasS3Amazonaws: ${hasS3Amazonaws}, hasS3Region: ${hasS3Region})`);
            if (!isS3Url) {
                logger.error(`❌ Image ${i + 1} is NOT an S3 URL: ${imageUrl}`);
                logger.error(`   URL type check failed - skipping organization`);
                newUrls.push(imageUrl);
                skippedCount++;
                continue;
            }
            logger.info(`✅ Image ${i + 1} IS an S3 URL, will process`);
            // Extract current S3 key
            const oldKey = extractS3Key(imageUrl, logger);
            if (!oldKey) {
                logger.error(`❌ Could not extract S3 key from: ${imageUrl}`);
                logger.error(`   URL format might not be supported`);
                newUrls.push(imageUrl);
                skippedCount++;
                continue;
            }
            logger.info(`✅ Extracted S3 key: ${oldKey}`);
            // Get file extension
            const ext = oldKey.split(".").pop()?.toLowerCase() || "jpg";
            // Generate new key with proper folder structure (matches upload script)
            let newKey;
            if (collectionName) {
                const brandFolder = sanitizeBrandName(collectionName);
                newKey = `product/${brandFolder}/${productName}/image_${i + 1}.${ext}`;
            }
            else {
                newKey = `product/${productName}/image_${i + 1}.${ext}`;
            }
            // Skip if already in correct location
            if (oldKey === newKey) {
                logger.info(`✅ Image ${i + 1} already organized: ${newKey}`);
                newUrls.push(imageUrl);
                skippedCount++;
                continue;
            }
            // Check if it's already in a proper folder structure
            const isInProductFolder = oldKey.startsWith("product/") && oldKey.includes(`/${productName}/`);
            const isInProjectFolder = oldKey.startsWith("product/") && oldKey.includes(`/${productName}/`);
            if (isInProductFolder || isInProjectFolder) {
                logger.info(`✅ Image ${i + 1} already in organized folder: ${oldKey}`);
                newUrls.push(imageUrl);
                skippedCount++;
                continue;
            }
            // Move to new location - retry up to 3 times for 1-2 images
            logger.info(`📦 MOVING image ${i + 1} from: ${oldKey}`);
            logger.info(`📦 MOVING image ${i + 1} to: ${newKey}`);
            let success = false;
            let moveRetries = product.images.length <= 2 ? 3 : 1; // More retries for 1-2 images
            for (let retry = 1; retry <= moveRetries; retry++) {
                if (retry > 1) {
                    logger.info(`🔄 Retry ${retry}/${moveRetries} for image ${i + 1}...`);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between retries
                }
                success = await moveS3Object(oldKey, newKey, logger);
                if (success) {
                    break;
                }
                else if (retry < moveRetries) {
                    logger.warn(`⚠️  Move attempt ${retry} failed, will retry...`);
                }
            }
            if (success) {
                const newUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${newKey}`;
                newUrls.push(newUrl);
                movedCount++;
                logger.info(`✅✅✅ SUCCESSFULLY MOVED image ${i + 1} to: ${newKey}`);
            }
            else {
                logger.error(`❌ FAILED to move image ${i + 1} after ${moveRetries} attempt(s) from ${oldKey} to ${newKey}`);
                // Still add the new URL so product gets updated with organized structure
                const newUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${newKey}`;
                newUrls.push(newUrl); // Use new URL even if move failed - file might be there
                skippedCount++;
            }
        }
        // ALWAYS update product URLs if we processed any images (even if none were moved)
        // This ensures 1-2 images also get organized
        logger.info(`📊 Summary: ${product.images.length} total images, ${movedCount} moved, ${skippedCount} skipped, ${newUrls.length} URLs prepared`);
        if (newUrls.length > 0) {
            try {
                logger.info(`🔄 Updating product "${product.title}" with ${newUrls.length} image URL(s)`);
                logger.info(`   URLs to update: ${newUrls.map((url, idx) => `\n   ${idx + 1}. ${url}`).join('')}`);
                await productService.updateProducts({ id: product.id }, {
                    images: newUrls.map((url) => ({ url })),
                    thumbnail: newUrls.find(url => url && url.includes("s3")) || newUrls[0] || product.thumbnail,
                });
                // Cache the S3 folder path for deletion subscriber
                const s3FolderPath = collectionName
                    ? `product/${sanitizeBrandName(collectionName)}/${productName}/`
                    : `product/${productName}/`;
                exports.productS3FolderCache.set(product.id, s3FolderPath);
                logger.info(`   📋 Cached S3 folder for deletion: ${s3FolderPath}`);
                if (movedCount > 0) {
                    logger.info(`✅✅✅ SUCCESS: Organized "${product.title}" images: ${movedCount} moved to ${s3FolderPath}, ${skippedCount} skipped`);
                }
                else if (skippedCount > 0) {
                    logger.info(`ℹ️  Product "${product.title}" images: ${skippedCount} already organized or skipped (check logs above for details)`);
                }
                else {
                    logger.warn(`⚠️  Product "${product.title}" images: No images were moved or skipped - check logs above`);
                }
            }
            catch (error) {
                logger.error(`❌ CRITICAL: Failed to update product URLs: ${error.message}`);
                logger.error(error.stack);
            }
        }
        else {
            logger.error(`❌ ERROR: No URLs prepared for product "${product.title}" - images may not have been processed`);
        }
    }
    catch (error) {
        logger.error(`❌ Failed to organize images for product ${data.id}: ${error.message}`);
    }
}
exports.config = {
    event: ["product.created", "product.updated"],
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZHVjdC1pbWFnZS1zMy1vcmdhbml6ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zY3JpcHRzL3Byb2R1Y3QtaW1hZ2UtczMtb3JnYW5pemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7R0FRRzs7O0FBc0tILHdDQXFQQztBQXhaRCxrREFBOEg7QUFFOUgsbURBQW1EO0FBQ25ELE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxJQUFJLEVBQUUsQ0FBQTtBQUMxQyxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsSUFBSSxZQUFZLENBQUE7QUFDcEQsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLENBQUE7QUFDckQsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsSUFBSSxFQUFFLENBQUE7QUFFekQsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDO0lBQ3RCLE1BQU0sRUFBRSxNQUFNO0lBQ2QsV0FBVyxFQUFFO1FBQ1gsV0FBVyxFQUFFLFVBQVU7UUFDdkIsZUFBZSxFQUFFLFVBQVU7S0FDNUI7Q0FDRixDQUFDLENBQUE7QUFFRixpREFBaUQ7QUFDakQsK0NBQStDO0FBQ2xDLFFBQUEsb0JBQW9CLEdBQUcsSUFBSSxHQUFHLEVBQWtCLENBQUE7QUFFN0Q7O0dBRUc7QUFDSCxTQUFTLGlCQUFpQixDQUFDLElBQVk7SUFDckMsT0FBTyxJQUFJO1NBQ1IsV0FBVyxFQUFFO1NBQ2IsSUFBSSxFQUFFO1NBQ04sT0FBTyxDQUFDLGFBQWEsRUFBRSxHQUFHLENBQUM7U0FDM0IsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7U0FDdkIsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUM7U0FDWixPQUFPLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFBO0FBQ3ZC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
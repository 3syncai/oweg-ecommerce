/**
 * 📸 Product Image Organizer - Move uploaded images to proper folders
 * 
 * Automatically organizes product images into structured folders:
 * - product/{exact_product_name}/image_1.png (no collection/brand)
 * - product/{brand_name}/{exact_product_name}/image_1.png (with brand/collection)
 * 
 * Matches the folder structure from upload-images-to-s3.js
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { S3Client, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"

// Load S3 configuration from environment variables
const BUCKET = process.env.S3_BUCKET || ""
const REGION = process.env.S3_REGION || "ap-south-1"
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID || ""
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY || ""

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
})

// Global cache: Map product ID to S3 folder path
// This will be used by the deletion subscriber
export const productS3FolderCache = new Map<string, string>()

/**
 * Sanitize brand name (lowercase, hyphenated) - matches upload script
 */
function sanitizeBrandName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "")
}

/**
 * Sanitize product name (exact name with minimal changes) - matches upload script
 */
function sanitizeProductName(name: string): string {
  return name
    .trim()
    // Only replace truly problematic characters for S3: / \ ? * : | " < >
    .replace(/[\/\\?*:|"<>]/g, "-")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .slice(0, 100)
}

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

async function moveS3Object(
  oldKey: string,
  newKey: string,
  logger: any
): Promise<boolean> {
  try {
    logger.info(`🔍 Step 1: Checking if source file exists: ${oldKey}`)
    const sourceExists = await objectExists(oldKey)
    if (!sourceExists) {
      logger.error(`❌ Source file DOES NOT EXIST in S3: ${oldKey}`)
      return false
    }
    logger.info(`✅ Source file EXISTS: ${oldKey}`)

    logger.info(`🔍 Step 2: Checking if destination exists: ${newKey}`)
    if (await objectExists(newKey)) {
      logger.info(`✅ Destination already exists: ${newKey}`)
      return true
    }
    logger.info(`✅ Destination does not exist, will create: ${newKey}`)

    logger.info(`📋 Step 3: Copying from ${oldKey} to ${newKey}`)
    await s3.send(
      new CopyObjectCommand({
        Bucket: BUCKET,
        CopySource: `${BUCKET}/${oldKey}`,
        Key: newKey,
      })
    )
    logger.info(`✅ Copy successful! File now at: ${newKey}`)

    logger.info(`🗑️  Step 4: Deleting old file: ${oldKey}`)
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: BUCKET,
          Key: oldKey,
        })
      )
      logger.info(`✅ Old file deleted successfully: ${oldKey}`)
    } catch (deleteError: any) {
      logger.warn(`⚠️  Could not delete old file ${oldKey}: ${deleteError.message}`)
      // Don't fail if delete fails - file is already copied
    }

    logger.info(`🎉 SUCCESS: File moved from ${oldKey} to ${newKey}`)
    return true
  } catch (error: any) {
    logger.error(`❌ CRITICAL ERROR moving ${oldKey} to ${newKey}`)
    logger.error(`Error name: ${error.name}`)
    logger.error(`Error message: ${error.message}`)
    logger.error(`Error code: ${error.Code || 'N/A'}`)
    logger.error(`Full error: ${JSON.stringify(error, null, 2)}`)
    return false
  }
}

function extractS3Key(url: string, logger?: any): string | null {
  try {
    if (logger) logger.info(`🔍 Extracting S3 key from URL: ${url}`)

    // Handle different S3 URL formats
    // Format 1: https://bucket.s3.region.amazonaws.com/key
    if (url.includes(`${BUCKET}.s3.${REGION}.amazonaws.com/`)) {
      const key = url.split(`${BUCKET}.s3.${REGION}.amazonaws.com/`)[1]
      logger.info(`✅ Extracted key (format 1): ${key}`)
      return key
    }

    // Format 2: https://bucket.s3.amazonaws.com/key
    if (url.includes(`${BUCKET}.s3.amazonaws.com/`)) {
      const key = url.split(`${BUCKET}.s3.amazonaws.com/`)[1]
      logger.info(`✅ Extracted key (format 2): ${key}`)
      return key
    }

    // Format 3: https://s3.region.amazonaws.com/bucket/key
    if (url.includes(`s3.${REGION}.amazonaws.com/${BUCKET}/`)) {
      const key = url.split(`s3.${REGION}.amazonaws.com/${BUCKET}/`)[1]
      logger.info(`✅ Extracted key (format 3): ${key}`)
      return key
    }

    // Format 4: https://s3.amazonaws.com/bucket/key
    if (url.includes("s3.amazonaws.com/")) {
      const parts = url.split("s3.amazonaws.com/")
      if (parts[1]) {
        // Remove bucket name from path if present
        const pathParts = parts[1].split("/")
        if (pathParts[0] === BUCKET) {
          const key = pathParts.slice(1).join("/")
          logger.info(`✅ Extracted key (format 4): ${key}`)
          return key
        }
        // If no bucket in path, return everything after s3.amazonaws.com/
        const key = parts[1]
        logger.info(`✅ Extracted key (format 4, no bucket): ${key}`)
        return key
      }
    }

    logger.warn(`❌ Could not extract S3 key from URL: ${url}`)
    return null
  } catch (error: any) {
    logger.error(`❌ Error extracting S3 key: ${error.message}`)
    return null
  }
}

export default async function productImageOrganizer({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const productService = container.resolve("product")
  const logger = container.resolve("logger")

  logger.info(`🚀 PRODUCT IMAGE ORGANIZER TRIGGERED for product ID: ${data.id}`)

  try {
    // Skip if S3 not configured
    if (!ACCESS_KEY || !SECRET_KEY || !BUCKET) {
      logger.error("❌ S3 not configured! ACCESS_KEY, SECRET_KEY, or BUCKET missing")
      return
    }

    logger.info(`✅ S3 configured: BUCKET=${BUCKET}, REGION=${REGION}`)

    // Wait longer for images to be uploaded to S3 (especially for 1-2 images)
    logger.info(`⏳ Waiting 5 seconds for images to be uploaded to S3...`)
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Retrieve product with images - retry if needed
    let product
    let retries = 3
    while (retries > 0) {
      try {
        product = await productService.retrieveProduct(data.id, {
          relations: ["images", "collection"],
        })
        if (product?.images?.length) {
          break
        }
      } catch (error: any) {
        logger.warn(`Retry ${4 - retries}: ${error.message}`)
      }
      if (!product?.images?.length && retries > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      retries--
    }

    if (!product) {
      try {
        product = await productService.retrieveProduct(data.id)
      } catch (error: any) {
        logger.error(`Failed to retrieve product ${data.id}: ${error.message}`)
        return
      }
    }

    if (!product?.images?.length) {
      logger.info(`Product ${product?.title || data.id} has no images, skipping`)
      return
    }

    logger.info(`🔍 Found ${product.images.length} image(s) for product: ${product.title}`)

    // Get collection name
    let collectionName: string | null = null
    if (product.collection_id) {
      try {
        const collectionService: any = container.resolve("productCollection")
        const collection = await collectionService.retrieveCollection(product.collection_id)
        collectionName = collection?.title || collection?.handle || null
      } catch {
        try {
          const collectionService: any = container.resolve("collection")
          const collection = await collectionService.retrieve(product.collection_id)
          collectionName = collection?.title || collection?.handle || null
        } catch {
          if ((product as any).collection) {
            collectionName = (product as any).collection?.title || null
          }
        }
      }
    }

    const productName = sanitizeProductName(product.title || `product-${product.id}`)
    const newUrls: string[] = []
    let movedCount = 0
    let skippedCount = 0

    logger.info(`📂 Organizing images for: ${product.title}${collectionName ? ` (Brand: ${collectionName})` : ""}`)

    for (let i = 0; i < product.images.length; i++) {
      const image = product.images[i]
      const imageUrl = typeof image === "string" ? image : image?.url

      if (!imageUrl) {
        logger.warn(`Image ${i + 1} has no URL, skipping`)
        newUrls.push(imageUrl)
        skippedCount++
        continue
      }

      // Log the image URL for debugging
      logger.info(`📷 Image ${i + 1} URL: ${imageUrl}`)
      logger.info(`🔍 Checking if URL contains 's3.amazonaws.com': ${imageUrl.includes("s3.amazonaws.com")}`)
      logger.info(`🔍 Checking if URL contains 's3.${REGION}.amazonaws.com': ${imageUrl.includes(`s3.${REGION}.amazonaws.com`)}`)

      // Only process S3 URLs - check for s3.amazonaws.com in URL
      const hasS3Amazonaws = imageUrl.includes("s3.amazonaws.com")
      const hasS3Region = imageUrl.includes(`s3.${REGION}.amazonaws.com`)
      const isS3Url = hasS3Amazonaws || hasS3Region

      logger.info(`🔍 isS3Url result: ${isS3Url} (hasS3Amazonaws: ${hasS3Amazonaws}, hasS3Region: ${hasS3Region})`)

      if (!isS3Url) {
        logger.error(`❌ Image ${i + 1} is NOT an S3 URL: ${imageUrl}`)
        logger.error(`   URL type check failed - skipping organization`)
        newUrls.push(imageUrl)
        skippedCount++
        continue
      }

      logger.info(`✅ Image ${i + 1} IS an S3 URL, will process`)

      // Extract current S3 key
      const oldKey = extractS3Key(imageUrl, logger)
      if (!oldKey) {
        logger.error(`❌ Could not extract S3 key from: ${imageUrl}`)
        logger.error(`   URL format might not be supported`)
        newUrls.push(imageUrl)
        skippedCount++
        continue
      }

      logger.info(`✅ Extracted S3 key: ${oldKey}`)

      // Get file extension
      const ext = oldKey.split(".").pop()?.toLowerCase() || "jpg"

      // Generate new key with proper folder structure (matches upload script)
      let newKey: string
      if (collectionName) {
        const brandFolder = sanitizeBrandName(collectionName)
        newKey = `product/${brandFolder}/${productName}/image_${i + 1}.${ext}`
      } else {
        newKey = `product/${productName}/image_${i + 1}.${ext}`
      }

      // Skip if already in correct location
      if (oldKey === newKey) {
        logger.info(`✅ Image ${i + 1} already organized: ${newKey}`)
        newUrls.push(imageUrl)
        skippedCount++
        continue
      }

      // Check if it's already in a proper folder structure
      const isInProductFolder = oldKey.startsWith("product/") && oldKey.includes(`/${productName}/`)
      const isInProjectFolder = oldKey.startsWith("product/") && oldKey.includes(`/${productName}/`)

      if (isInProductFolder || isInProjectFolder) {
        logger.info(`✅ Image ${i + 1} already in organized folder: ${oldKey}`)
        newUrls.push(imageUrl)
        skippedCount++
        continue
      }

      // Move to new location - retry up to 3 times for 1-2 images
      logger.info(`📦 MOVING image ${i + 1} from: ${oldKey}`)
      logger.info(`📦 MOVING image ${i + 1} to: ${newKey}`)

      let success = false
      let moveRetries = product.images.length <= 2 ? 3 : 1 // More retries for 1-2 images

      for (let retry = 1; retry <= moveRetries; retry++) {
        if (retry > 1) {
          logger.info(`🔄 Retry ${retry}/${moveRetries} for image ${i + 1}...`)
          await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds between retries
        }

        success = await moveS3Object(oldKey, newKey, logger)

        if (success) {
          break
        } else if (retry < moveRetries) {
          logger.warn(`⚠️  Move attempt ${retry} failed, will retry...`)
        }
      }

      if (success) {
        const newUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${newKey}`
        newUrls.push(newUrl)
        movedCount++
        logger.info(`✅✅✅ SUCCESSFULLY MOVED image ${i + 1} to: ${newKey}`)
      } else {
        logger.error(`❌ FAILED to move image ${i + 1} after ${moveRetries} attempt(s) from ${oldKey} to ${newKey}`)
        // Still add the new URL so product gets updated with organized structure
        const newUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${newKey}`
        newUrls.push(newUrl) // Use new URL even if move failed - file might be there
        skippedCount++
      }
    }

    // ALWAYS update product URLs if we processed any images (even if none were moved)
    // This ensures 1-2 images also get organized
    logger.info(`📊 Summary: ${product.images.length} total images, ${movedCount} moved, ${skippedCount} skipped, ${newUrls.length} URLs prepared`)

    if (newUrls.length > 0) {
      try {
        logger.info(`🔄 Updating product "${product.title}" with ${newUrls.length} image URL(s)`)
        logger.info(`   URLs to update: ${newUrls.map((url, idx) => `\n   ${idx + 1}. ${url}`).join('')}`)

        await (productService as any).updateProducts(
          { id: product.id },
          {
            images: newUrls.map((url) => ({ url })),
            thumbnail: newUrls.find(url => url && url.includes("s3")) || newUrls[0] || product.thumbnail,
          }
        )

        // Cache the S3 folder path for deletion subscriber
        const s3FolderPath = collectionName
          ? `product/${sanitizeBrandName(collectionName)}/${productName}/`
          : `product/${productName}/`

        productS3FolderCache.set(product.id, s3FolderPath)
        logger.info(`   📋 Cached S3 folder for deletion: ${s3FolderPath}`)

        if (movedCount > 0) {
          logger.info(
            `✅✅✅ SUCCESS: Organized "${product.title}" images: ${movedCount} moved to ${s3FolderPath}, ${skippedCount} skipped`
          )
        } else if (skippedCount > 0) {
          logger.info(
            `ℹ️  Product "${product.title}" images: ${skippedCount} already organized or skipped (check logs above for details)`
          )
        } else {
          logger.warn(
            `⚠️  Product "${product.title}" images: No images were moved or skipped - check logs above`
          )
        }
      } catch (error: any) {
        logger.error(`❌ CRITICAL: Failed to update product URLs: ${error.message}`)
        logger.error(error.stack)
      }
    } else {
      logger.error(`❌ ERROR: No URLs prepared for product "${product.title}" - images may not have been processed`)
    }
  } catch (error: any) {
    logger.error(`❌ Failed to organize images for product ${data.id}: ${error.message}`)
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated"],
}
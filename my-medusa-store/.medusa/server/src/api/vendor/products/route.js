"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONS = OPTIONS;
exports.GET = GET;
exports.POST = POST;
const guards_1 = require("../_lib/guards");
const utils_1 = require("@medusajs/framework/utils");
const core_flows_1 = require("@medusajs/core-flows");
// CORS headers helper
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}
async function OPTIONS(req, res) {
    setCorsHeaders(res);
    return res.status(200).end();
}
async function GET(req, res) {
    setCorsHeaders(res);
    const auth = await (0, guards_1.requireApprovedVendor)(req, res);
    if (!auth)
        return;
    try {
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        // List all products - we'll filter by metadata client-side since Medusa v2
        // doesn't support metadata filtering directly in listProducts
        const products = await productModuleService.listProducts({});
        // Filter products by vendor_id in metadata
        const vendorProducts = products.filter((p) => {
            const metadata = p.metadata || {};
            return metadata.vendor_id === auth.vendor_id;
        });
        return res.json({ products: vendorProducts });
    }
    catch (error) {
        console.error("Vendor products list error:", error);
        return res.status(500).json({ message: error?.message || "Failed to list products" });
    }
}
async function POST(req, res) {
    setCorsHeaders(res);
    const auth = await (0, guards_1.requireApprovedVendor)(req, res);
    if (!auth)
        return;
    try {
        const body = req.body || {};
        const { title, subtitle, description, handle, category_ids, collection_id, tags, images, thumbnail, options, variants, weight, height, width, length, shipping_profile_id, discountable, metadata, } = body;
        if (!title) {
            return res.status(400).json({ message: "title is required" });
        }
        // Get default shipping profile if not provided
        let finalShippingProfileId = shipping_profile_id;
        if (!finalShippingProfileId) {
            const fulfillmentModuleService = req.scope.resolve(utils_1.Modules.FULFILLMENT);
            const profiles = await fulfillmentModuleService.listShippingProfiles({ type: "default" });
            if (profiles && profiles.length > 0) {
                finalShippingProfileId = profiles[0].id;
            }
        }
        // Medusa v2 REQUIRES: If variants exist, at least one product option MUST exist
        // Even for simple products with one variant, we need a default option
        let finalVariants = variants || [];
        let finalOptions = options || [];
        console.log("Received variants:", JSON.stringify(finalVariants, null, 2));
        console.log("Received options:", JSON.stringify(finalOptions, null, 2));
        // If no variants provided, create a default one
        // Note: Default variant will have empty prices - vendor must provide variants with prices
        if (finalVariants.length === 0) {
            console.warn('⚠️ No variants provided - creating default variant with empty prices. Vendor should provide variants with prices.');
            finalVariants = [
                {
                    title: "Default variant",
                    prices: [],
                },
            ];
        }
        // CRITICAL FIX: Medusa v2 requires options when variants exist
        // If no options provided, automatically create a default option
        if (finalOptions.length === 0 && finalVariants.length > 0) {
            // Create default product option
            finalOptions = [
                {
                    title: "Default",
                    values: ["Default"],
                },
            ];
            // Update all variants to reference the default option
            finalVariants = finalVariants.map((v) => {
                const cleaned = {
                    title: v.title || "Default variant",
                };
                // Preserve existing fields
                // SKU is optional - if provided and conflicts, we'll handle it in error handling
                if (v.sku && typeof v.sku === "string" && v.sku.trim()) {
                    cleaned.sku = v.sku.trim();
                }
                // If SKU is empty string, don't include it (Medusa treats empty string differently)
                else if (v.sku === "" || v.sku === null || v.sku === undefined) {
                    // Don't set SKU - let Medusa auto-generate or leave it empty
                }
                // Handle prices - ensure they're in the correct format
                if (v.prices && Array.isArray(v.prices) && v.prices.length > 0) {
                    cleaned.prices = v.prices
                        .map((p) => {
                        // Ensure price has amount and currency_code
                        if (!p || typeof p !== 'object')
                            return null;
                        // Convert amount to number if it's a string
                        let amount = p.amount;
                        if (typeof amount === 'string') {
                            amount = parseFloat(amount);
                        }
                        // Ensure amount is a valid number
                        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
                            return null;
                        }
                        // Ensure currency_code exists, default to 'inr'
                        const currency_code = p.currency_code || 'inr';
                        return {
                            amount: Math.round(amount), // Ensure integer (paise/cents)
                            currency_code: currency_code.toLowerCase()
                        };
                    })
                        .filter((p) => p !== null);
                    // If no valid prices after filtering, log a warning
                    if (cleaned.prices.length === 0 && v.prices.length > 0) {
                        console.warn('⚠️ No valid prices found for variant:', v.title, 'Original prices:', v.prices);
                    }
                }
                else {
                    cleaned.prices = [];
                    // Log warning if variant has no prices
                    if (v.title) {
                        console.warn('⚠️ Variant has no prices:', v.title);
                    }
                }
                if (typeof v.manage_inventory === "boolean") {
                    cleaned.manage_inventory = v.manage_inventory;
                }
                if (typeof v.allow_backorder === "boolean") {
                    cleaned.allow_backorder = v.allow_backorder;
                }
                if (typeof v.inventory_quantity === "number") {
                    cleaned.inventory_quantity = v.inventory_quantity;
                }
                // CRITICAL: Medusa v2 expects option_values, NOT options
                // Using 'options' causes Medusa to merge with prices and corrupt the data
                cleaned.option_values = [
                    {
                        value: "Default",
                    },
                ];
                return cleaned;
            });
        }
        // CRITICAL: Convert any existing 'options' to 'option_values' for all variants
        // Medusa v2 internally merges 'options' with 'prices', causing corruption
        finalVariants = finalVariants.map((v) => {
            // If variant has 'options', convert to 'option_values' and remove 'options'
            if (v.options && Array.isArray(v.options)) {
                const cleaned = { ...v };
                cleaned.option_values = v.options.map((opt) => {
                    // Handle both { value: "..." } and string formats
                    if (typeof opt === "string") {
                        return { value: opt };
                    }
                    if (typeof opt === "object" && opt.value) {
                        return { value: opt.value };
                    }
                    return null;
                }).filter((opt) => opt !== null);
                delete cleaned.options;
                return cleaned;
            }
            // If variant already has 'option_values', keep it
            return v;
        });
        console.log("Final options:", JSON.stringify(finalOptions, null, 2));
        console.log("Final variants:", JSON.stringify(finalVariants, null, 2));
        // Handle tags - Medusa v2 requires tag IDs, not values
        // We need to find existing tags or create new ones, then use their IDs
        let normalizedTags = [];
        if (tags && Array.isArray(tags) && tags.length > 0) {
            const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
            // Separate tags with IDs from tags with values
            const tagsWithIds = [];
            const tagValues = [];
            for (const tag of tags) {
                if (typeof tag === "object" && tag.id) {
                    // Tag already has an ID, use it directly
                    tagsWithIds.push({ id: tag.id });
                }
                else if (typeof tag === "object" && tag.value) {
                    tagValues.push(tag.value.trim());
                }
                else if (typeof tag === "string") {
                    tagValues.push(tag.trim());
                }
            }
            // For tags with values, find or create them
            if (tagValues.length > 0) {
                try {
                    // Try to list existing tags - method name may vary
                    let existingTags = [];
                    try {
                        // Try different possible method names
                        if (typeof productModuleService.listProductTags === "function") {
                            existingTags = await productModuleService.listProductTags({});
                        }
                        else if (typeof productModuleService.listTags === "function") {
                            existingTags = await productModuleService.listTags({});
                        }
                        else if (typeof productModuleService.list === "function") {
                            // Some services use generic list method
                            existingTags = await productModuleService.list({});
                        }
                    }
                    catch (listError) {
                        console.warn("Could not list existing tags:", listError?.message);
                    }
                    // Create a map of tag values to IDs (case-insensitive)
                    const tagValueToId = new Map();
                    if (Array.isArray(existingTags)) {
                        existingTags.forEach((tag) => {
                            if (tag.value && tag.id) {
                                tagValueToId.set(tag.value.toLowerCase().trim(), tag.id);
                            }
                        });
                    }
                    // Find or create tags
                    for (const tagValue of tagValues) {
                        if (!tagValue)
                            continue;
                        const normalizedValue = tagValue.toLowerCase().trim();
                        let tagId = tagValueToId.get(normalizedValue);
                        // If tag doesn't exist, try to create it
                        if (!tagId) {
                            try {
                                let newTag = null;
                                // Try different possible method names for creating tags
                                if (typeof productModuleService.createProductTags === "function") {
                                    const created = await productModuleService.createProductTags([{ value: tagValue }]);
                                    newTag = created?.[0];
                                }
                                else if (typeof productModuleService.createTags === "function") {
                                    const created = await productModuleService.createTags([{ value: tagValue }]);
                                    newTag = created?.[0];
                                }
                                else if (typeof productModuleService.create === "function") {
                                    const created = await productModuleService.create([{ value: tagValue }]);
                                    newTag = created?.[0];
                                }
                                if (newTag?.id) {
                                    tagId = newTag.id;
                                    tagValueToId.set(normalizedValue, newTag.id); // Use newTag.id directly to be safe
                                }
                            }
                            catch (createError) {
                                console.warn(`Failed to create tag "${tagValue}":`, createError?.message);
                                // Continue with other tags - don't fail product creation
                            }
                        }
                        if (tagId) {
                            normalizedTags.push({ id: tagId });
                        }
                    }
                }
                catch (tagError) {
                    console.warn("Error processing tags:", tagError?.message);
                    // If tag processing fails, continue without tags rather than failing product creation
                }
            }
            // Combine tags with IDs and newly created/found tags
            normalizedTags = [...tagsWithIds, ...normalizedTags];
            console.log(`Processed ${normalizedTags.length} tag(s) for product creation`);
            // If no tags were successfully processed, set to empty array to avoid errors
            if (normalizedTags.length === 0) {
                normalizedTags = [];
            }
        }
        // Normalize category_ids - ensure it's an array of strings
        let normalizedCategoryIds = [];
        if (category_ids && Array.isArray(category_ids)) {
            normalizedCategoryIds = category_ids.filter((id) => id && typeof id === "string");
        }
        // Normalize collection_id - convert empty string to undefined (Medusa expects undefined, not null)
        const normalizedCollectionId = collection_id && typeof collection_id === "string" && collection_id.trim()
            ? collection_id.trim()
            : undefined;
        // Normalize images - ensure they're objects with 'url' property
        let normalizedImages = [];
        if (images && Array.isArray(images)) {
            normalizedImages = images
                .map((img) => {
                if (typeof img === "string") {
                    return { url: img };
                }
                if (typeof img === "object" && img.url) {
                    return { url: img.url };
                }
                return null;
            })
                .filter((img) => img !== null);
        }
        // Prepare metadata - merge vendor metadata with user-provided metadata
        const baseMetadata = {
            vendor_id: auth.vendor_id,
            approval_status: "pending", // Custom status for admin approval
            submitted_at: new Date().toISOString(),
        };
        // Merge user-provided metadata (MID code, HS code, country of origin, etc.)
        if (metadata && typeof metadata === "object") {
            Object.assign(baseMetadata, metadata);
        }
        // Add videos to images array (same structure as images) for database storage
        // Videos will be stored in the database the same way as images
        const videosFromMetadata = baseMetadata?.videos;
        if (videosFromMetadata && Array.isArray(videosFromMetadata)) {
            const videoImageObjects = videosFromMetadata
                .map((video) => {
                if (typeof video === "object" && video.url) {
                    // Store video URL in images array (same structure as images)
                    return { url: video.url };
                }
                if (typeof video === "string") {
                    return { url: video };
                }
                return null;
            })
                .filter((video) => video !== null);
            // Add videos to the images array so they're stored in database the same way
            normalizedImages = [...normalizedImages, ...videoImageObjects];
            console.log(`Added ${videoImageObjects.length} video(s) to images array for database storage`);
        }
        // Generate handle from title if not provided
        // Handle must be unique, so we'll append a timestamp if it already exists
        const generateHandle = (title) => {
            return title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .substring(0, 100);
        };
        let finalHandle = handle || generateHandle(title);
        // If handle is provided but might be duplicate, append timestamp to make it unique
        if (handle) {
            // Check if handle already exists by trying to find products with this handle
            try {
                const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
                const existingProducts = await productModuleService.listProducts({
                    handle: finalHandle,
                });
                if (existingProducts && existingProducts.length > 0) {
                    // Handle exists, append timestamp to make it unique
                    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
                    finalHandle = `${finalHandle}-${timestamp}`;
                    console.log(`Handle "${handle}" already exists, using unique handle: "${finalHandle}"`);
                }
            }
            catch (checkError) {
                // If check fails, append timestamp anyway to be safe
                const timestamp = Date.now().toString().slice(-6);
                finalHandle = `${finalHandle}-${timestamp}`;
                console.log(`Could not check handle uniqueness, using unique handle: "${finalHandle}"`);
            }
        }
        else {
            // No handle provided, generate from title and append timestamp for uniqueness
            const timestamp = Date.now().toString().slice(-6);
            finalHandle = `${finalHandle}-${timestamp}`;
        }
        // Prepare product data
        const productData = {
            title,
            subtitle: subtitle || null,
            description: description || null,
            handle: finalHandle,
            thumbnail: thumbnail || (normalizedImages.length > 0 ? normalizedImages[0].url : null),
            is_giftcard: false,
            discountable: discountable !== false,
            category_ids: normalizedCategoryIds,
            collection_id: normalizedCollectionId,
            tags: normalizedTags,
            images: normalizedImages,
            options: finalOptions,
            variants: finalVariants,
            // Physical attributes
            weight: weight || null,
            height: height || null,
            width: width || null,
            length: length || null,
            status: utils_1.ProductStatus.DRAFT, // Set to DRAFT, pending admin approval
            shipping_profile_id: finalShippingProfileId,
            metadata: baseMetadata,
        };
        // Log product data with detailed price information
        console.log("Creating product with data:", JSON.stringify({
            ...productData,
            variants: productData.variants.map((v) => ({
                ...v,
                prices: v.prices,
                priceCount: v.prices?.length || 0,
                hasPrices: (v.prices?.length || 0) > 0,
            })),
        }, null, 2));
        // Validate that at least one variant has prices
        const hasAnyPrices = productData.variants.some((v) => v.prices && Array.isArray(v.prices) && v.prices.length > 0);
        if (!hasAnyPrices) {
            console.warn('⚠️ WARNING: Product has no prices! All variants have empty prices array.');
        }
        // Create product using workflow with PENDING status for admin approval
        const { result } = await (0, core_flows_1.createProductsWorkflow)(req.scope).run({
            input: {
                products: [productData],
            },
        });
        const product = result[0];
        // Link product to default sales channel
        try {
            const salesChannelModuleService = req.scope.resolve(utils_1.Modules.SALES_CHANNEL);
            const defaultSalesChannels = await salesChannelModuleService.listSalesChannels({
                name: "Default Sales Channel",
            });
            if (defaultSalesChannels && defaultSalesChannels.length > 0) {
                const defaultSalesChannel = defaultSalesChannels[0];
                const linkModule = req.scope.resolve(utils_1.ContainerRegistrationKeys.LINK);
                // Link product to sales channel using Medusa v2 link module
                // Format: { [module1]: { id_field: id }, [module2]: { id_field: id } }
                await linkModule.create({
                    [utils_1.Modules.PRODUCT]: {
                        product_id: product.id,
                    },
                    [utils_1.Modules.SALES_CHANNEL]: {
                        sales_channel_id: defaultSalesChannel.id,
                    },
                });
                console.log(`✅ Linked product ${product.id} to default sales channel ${defaultSalesChannel.id}`);
            }
            else {
                console.warn("⚠️ Default Sales Channel not found - product may not be available in any sales channel");
            }
        }
        catch (linkError) {
            console.error("❌ Failed to link product to sales channel:", linkError?.message);
            // Don't fail product creation if sales channel linking fails, but log the error
        }
        return res.json({ product });
    }
    catch (error) {
        console.error("Vendor product create error:", error);
        console.error("Error stack:", error?.stack);
        console.error("Error details:", {
            message: error?.message,
            type: error?.type,
            code: error?.code,
            name: error?.name,
        });
        // Handle duplicate SKU error specifically
        if (error?.message && error.message.includes("already exists") && error.message.includes("sku")) {
            return res.status(400).json({
                message: "A product variant with this SKU already exists. Please use a different SKU or leave it empty.",
                error: "duplicate_sku",
                details: error?.message,
            });
        }
        // Handle duplicate handle error - return helpful message
        if (error?.message && error.message.includes("already exists") && error.message.includes("handle")) {
            return res.status(400).json({
                message: "A product with this handle already exists. The system will automatically generate a unique handle. Please try again.",
                error: "duplicate_handle",
                details: error?.message,
            });
        }
        return res.status(500).json({
            message: error?.message || "Failed to create product",
            error: error?.type || "unknown_error",
            details: process.env.NODE_ENV === "development" ? error?.stack : undefined,
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9wcm9kdWN0cy9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWFBLDBCQUdDO0FBRUQsa0JBdUJDO0FBRUQsb0JBdWZDO0FBamlCRCwyQ0FBc0Q7QUFDdEQscURBQTZGO0FBQzdGLHFEQUE2RDtBQUU3RCxzQkFBc0I7QUFDdEIsU0FBUyxjQUFjLENBQUMsR0FBbUI7SUFDekMsR0FBRyxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLENBQUMsQ0FBQTtJQUNqRCxHQUFHLENBQUMsU0FBUyxDQUFDLDhCQUE4QixFQUFFLGlDQUFpQyxDQUFDLENBQUE7SUFDaEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyw4QkFBOEIsRUFBRSxvREFBb0QsQ0FBQyxDQUFBO0lBQ25HLEdBQUcsQ0FBQyxTQUFTLENBQUMsa0NBQWtDLEVBQUUsTUFBTSxDQUFDLENBQUE7QUFDM0QsQ0FBQztBQUVNLEtBQUssVUFBVSxPQUFPLENBQUMsR0FBa0IsRUFBRSxHQUFtQjtJQUNuRSxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDbkIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFBO0FBQzlCLENBQUM7QUFFTSxLQUFLLFVBQVUsR0FBRyxDQUFDLEdBQWtCLEVBQUUsR0FBbUI7SUFDL0QsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ25CLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBQSw4QkFBcUIsRUFBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUE7SUFDbEQsSUFBSSxDQUFDLElBQUk7UUFBRSxPQUFNO0lBRWpCLElBQUksQ0FBQztRQUNILE1BQU0sb0JBQW9CLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsZUFBTyxDQUFDLE9BQU8sQ0FBQyxDQUFBO1FBRS9ELDJFQUEy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
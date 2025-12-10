"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = exports.GET = void 0;
const utils_1 = require("@medusajs/framework/utils");
const pg_1 = require("pg");
const flash_sale_1 = require("../../../modules/flash-sale");
const GET = async (req, res) => {
    try {
        const flashSaleService = req.scope.resolve(flash_sale_1.FLASH_SALE_MODULE);
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        // Get all flash sale items (including expired ones for display)
        const allItems = await flashSaleService.listFlashSaleItems({});
        // Filter out deleted items
        const activeItems = allItems.filter((item) => !item.deleted_at);
        // Get unique product IDs
        const productIds = Array.from(new Set(activeItems.map((item) => item.product_id)));
        // Fetch products for display
        const productsMap = new Map();
        if (productIds.length > 0) {
            try {
                const products = await productModuleService.listProducts({
                    id: productIds,
                });
                products.forEach((product) => {
                    productsMap.set(product.id, {
                        id: product.id,
                        title: product.title,
                        thumbnail: product.thumbnail,
                    });
                });
            }
            catch (productErr) {
                console.error("Error fetching products for flash sales:", productErr);
            }
        }
        // Group items by expiration time and enrich with product data
        const now = new Date();
        const enrichedItems = activeItems.map((item) => {
            const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at);
            const isActive = expiresAt > now;
            const product = productsMap.get(item.product_id) || { id: item.product_id, title: "Unknown Product" };
            return {
                id: item.id,
                product_id: item.product_id,
                variant_id: item.variant_id,
                product_title: product.title,
                product_thumbnail: product.thumbnail,
                flash_sale_price: item.flash_sale_price,
                original_price: item.original_price,
                expires_at: item.expires_at,
                created_at: item.created_at,
                updated_at: item.updated_at,
                is_active: isActive,
                time_remaining_ms: isActive ? Math.max(0, expiresAt.getTime() - now.getTime()) : 0,
            };
        });
        // Sort: active first (by expiration time ascending), then expired (by expiration time descending)
        enrichedItems.sort((a, b) => {
            const aExpires = new Date(a.expires_at).getTime();
            const bExpires = new Date(b.expires_at).getTime();
            if (a.is_active && b.is_active) {
                return aExpires - bExpires; // Active: earliest expiration first
            }
            if (a.is_active)
                return -1; // Active before expired
            if (b.is_active)
                return 1;
            return bExpires - aExpires; // Expired: most recent first
        });
        return res.json({
            flash_sale_items: enrichedItems,
            active_count: enrichedItems.filter((item) => item.is_active).length,
            total_count: enrichedItems.length,
        });
    }
    catch (error) {
        console.error("Error fetching flash sale items:", error);
        return res.status(500).json({
            message: "Failed to fetch flash sale items",
            error: error.message
        });
    }
};
exports.GET = GET;
const POST = async (req, res) => {
    try {
        const flashSaleService = req.scope.resolve(flash_sale_1.FLASH_SALE_MODULE);
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        const query = req.scope.resolve("query");
        const { items } = req.body;
        // Validate input
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                message: "items must be a non-empty array"
            });
        }
        // Validate each item and fetch variant info
        const validatedItems = [];
        for (const item of items) {
            if (!item.product_id) {
                return res.status(400).json({
                    message: "Each item must have a product_id"
                });
            }
            if (!item.flash_sale_price || typeof item.flash_sale_price !== 'number') {
                return res.status(400).json({
                    message: "Each item must have a flash_sale_price (number)"
                });
            }
            if (!item.expires_at) {
                return res.status(400).json({
                    message: "Each item must have an expires_at (timer)"
                });
            }
            // Get variant_id - use provided one or fetch from database
            let variantId = item.variant_id;
            // If variant_id not provided or is null, fetch from database directly
            if (!variantId) {
                try {
                    // Use direct database query to fetch first variant (most reliable)
                    const databaseUrl = process.env.DATABASE_URL;
                    if (!databaseUrl) {
                        return res.status(500).json({
                            message: "DATABASE_URL environment variable is not set"
                        });
                    }
                    const dbClient = new pg_1.Client({
                        connectionString: databaseUrl,
                    });
                    try {
                        await dbClient.connect();
                        const result = await dbClient.query(`SELECT id FROM product_variant WHERE product_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`, [item.product_id]);
                        if (result.rows.length === 0) {
                            await dbClient.end();
                            return res.status(400).json({
                                message: `Product ${item.product_id} has no variants. Please ensure the product has at least one variant in the product details page.`
                            });
                        }
                        variantId = result.rows[0].id;
                        console.log(`[Flash Sale] Found variant ${variantId} for product ${item.product_id}`);
                        await dbClient.end();
                    }
                    catch (dbErr) {
                        await dbClient.end();
                        throw dbErr;
                    }
                }
                catch (variantErr) {
                    console.error(`Error fetching variants for product ${item.product_id}:`, variantErr);
                    return res.status(400).json({
                        message: `Failed to fetch variants for product ${item.product_id}: ${variantErr.message}. Please ensure the product has at least one variant.`
                    });
                }
            }
            // Validate variant_id is present
            if (!variantId) {
                return res.status(400).json({
                    message: `Could not determine variant_id for product ${item.product_id}. Please ensure the product has at least one variant.`
                });
            }
            validatedItems.push({
                product_id: item.product_id,
                variant_id: variantId,
                flash_sale_price: item.flash_sale_price,
                original_price: item.original_price || 0, // Use provided original_price
                expires_at: item.expires_at,
            });
        }
        // Create flash sale items
        const createdItems = await flashSaleService.createFlashSaleItemsBatch(validatedItems);
        return res.json({ flash_sale_items: createdItems });
    }
    catch (error) {
        console.error("Error creating flash sale items:", error);
        return res.status(500).json({
            message: "Failed to create flash sale items",
            error: error.message
        });
    }
};
exports.POST = POST;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL2FkbWluL2ZsYXNoLXNhbGUvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EscURBQW1EO0FBQ25ELDJCQUEyQjtBQUUzQiw0REFBK0Q7QUFFeEQsTUFBTSxHQUFHLEdBQUcsS0FBSyxFQUFFLEdBQWtCLEVBQUUsR0FBbUIsRUFBRSxFQUFFO0lBQ25FLElBQUksQ0FBQztRQUNILE1BQU0sZ0JBQWdCLEdBQTJCLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLDhCQUFpQixDQUFDLENBQUE7UUFDckYsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsT0FBTyxDQUFDLENBQUE7UUFFL0QsZ0VBQWdFO1FBQ2hFLE1BQU0sUUFBUSxHQUFHLE1BQU0sZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLENBQUE7UUFFOUQsMkJBQTJCO1FBQzNCLE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFBO1FBRXBFLHlCQUF5QjtRQUN6QixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFFdkYsNkJBQTZCO1FBQzdCLE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUE7UUFDN0IsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQztnQkFDSCxNQUFNLFFBQVEsR0FBRyxNQUFNLG9CQUFvQixDQUFDLFlBQVksQ0FBQztv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
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = void 0;
const utils_1 = require("@medusajs/framework/utils");
const flash_sale_1 = require("../../../../modules/flash-sale");
const GET = async (req, res) => {
    try {
        console.log('[Flash Sale API] Starting flash sale products fetch...');
        const flashSaleService = req.scope.resolve(flash_sale_1.FLASH_SALE_MODULE);
        const productModuleService = req.scope.resolve(utils_1.Modules.PRODUCT);
        // Get all flash sale items (don't cleanup yet, just filter)
        console.log('[Flash Sale API] Fetching flash sale items...');
        const allItems = await flashSaleService.listFlashSaleItems({});
        console.log(`[Flash Sale API] Total items in DB: ${allItems.length}`);
        // Filter for active items (not deleted and not expired) - manual check for better control
        const now = new Date();
        console.log(`[Flash Sale API] Current time: ${now.toISOString()}`);
        const flashSaleItems = allItems.filter((item) => {
            // Skip deleted items
            if (item.deleted_at) {
                console.log(`[Flash Sale API] Item ${item.id} is deleted`);
                return false;
            }
            // Check expiration
            const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at);
            const isActive = expiresAt > now;
            if (!isActive) {
                console.log(`[Flash Sale API] Item ${item.id} expired: expires_at=${expiresAt.toISOString()}, now=${now.toISOString()}`);
            }
            return isActive;
        });
        console.log(`[Flash Sale API] Found ${flashSaleItems.length} active flash sale items after filtering`);
        if (flashSaleItems.length === 0) {
            // Check all items to see why none are active
            const allItems = await flashSaleService.listFlashSaleItems({});
            console.log(`[Flash Sale API] Total flash sale items in DB: ${allItems.length}`);
            if (allItems.length > 0) {
                const now = new Date();
                allItems.forEach((item, idx) => {
                    const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at);
                    const isExpired = expiresAt <= now;
                    const isDeleted = !!item.deleted_at;
                    console.log(`[Flash Sale API] Item ${idx + 1}: product_id=${item.product_id}, expires_at=${expiresAt.toISOString()}, isExpired=${isExpired}, isDeleted=${isDeleted}`);
                });
            }
            return res.json({
                active: false,
                flash_sale: null,
                products: []
            });
        }
        // Get unique product IDs
        const productIds = Array.from(new Set(flashSaleItems.map(item => item.product_id)));
        console.log(`[Flash Sale API] Found ${flashSaleItems.length} flash sale items for ${productIds.length} products:`, productIds);
        // Fetch products - try with id filter
        let products = [];
        try {
            products = await productModuleService.listProducts({
                id: productIds,
            });
            console.log(`[Flash Sale API] Fetched ${products.length} products from productModuleService`);
        }
        catch (error) {
            console.error('[Flash Sale API] Error fetching products:', error.message);
            // Try fetching one by one as fallback
            products = [];
            for (const productId of productIds) {
                try {
                    const product = await productModuleService.retrieveProduct(productId);
                    if (product)
                        products.push(product);
                }
                catch (e) {
                    console.error(`[Flash Sale API] Failed to fetch product ${productId}:`, e);
                }
            }
            console.log(`[Flash Sale API] Fetched ${products.length} products using fallback method`);
        }
        // Create flash sale item map by product_id
        const flashSaleItemMap = new Map();
        flashSaleItems.forEach(item => {
            flashSaleItemMap.set(item.product_id, item);
        });
        // Build products with flash sale prices
        const productsWithFlashSalePrices = products.map((product) => {
            const flashSaleItem = flashSaleItemMap.get(product.id);
            if (!flashSaleItem) {
                console.warn(`[Flash Sale API] No flash sale item found for product ${product.id}`);
                return null;
            }
            const expiresAt = flashSaleItem.expires_at instanceof Date
                ? flashSaleItem.expires_at
                : new Date(flashSaleItem.expires_at);
            // Calculate time remaining
            const now = new Date();
            const timeRemaining = Math.max(0, expiresAt.getTime() - now.getTime());
            // Get variant_id from product or flash sale item
            const variantId = flashSaleItem.variant_id || product.variants?.[0]?.id || null;
            return {
                ...product,
                variant_id: variantId, // Include variant_id for add to cart
                flash_sale_price: flashSaleItem.flash_sale_price, // Already in rupees
                original_price: flashSaleItem.original_price, // Already in rupees
                flash_sale: {
                    expires_at: expiresAt.toISOString(),
                    time_remaining_ms: timeRemaining,
                }
            };
        }).filter(Boolean);
        console.log(`[Flash Sale API] Returning ${productsWithFlashSalePrices.length} products with flash sale prices`);
        // Get the earliest expiration time for the countdown
        const earliestExpiration = flashSaleItems.reduce((earliest, item) => {
            const expiresAt = item.expires_at instanceof Date
                ? item.expires_at
                : new Date(item.expires_at);
            return !earliest || expiresAt < earliest ? expiresAt : earliest;
        }, null);
        const timeRemaining = earliestExpiration
            ? Math.max(0, earliestExpiration.getTime() - new Date().getTime())
            : 0;
        return res.json({
            active: true,
            flash_sale: {
                expires_at: earliestExpiration?.toISOString() || null,
                time_remaining_ms: timeRemaining,
                item_count: flashSaleItems.length,
            },
            products: productsWithFlashSalePrices
        });
    }
    catch (error) {
        console.error("Error fetching flash sale products:", error);
        return res.json({
            active: false,
            flash_sale: null,
            products: []
        });
    }
};
exports.GET = GET;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3N0b3JlL2ZsYXNoLXNhbGUvcHJvZHVjdHMvcm91dGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EscURBQW1EO0FBRW5ELCtEQUFrRTtBQUUzRCxNQUFNLEdBQUcsR0FBRyxLQUFLLEVBQUUsR0FBa0IsRUFBRSxHQUFtQixFQUFFLEVBQUU7SUFDbkUsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3REFBd0QsQ0FBQyxDQUFBO1FBQ3JFLE1BQU0sZ0JBQWdCLEdBQTJCLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLDhCQUFpQixDQUFDLENBQUE7UUFDckYsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsT0FBTyxDQUFDLENBQUE7UUFFL0QsNERBQTREO1FBQzVELE9BQU8sQ0FBQyxHQUFHLENBQUMsK0NBQStDLENBQUMsQ0FBQTtRQUM1RCxNQUFNLFFBQVEsR0FBRyxNQUFNLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxDQUFBO1FBQzlELE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFBO1FBRXJFLDBGQUEwRjtRQUMxRixNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFBO1FBQ3RCLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUE7UUFFbEUsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQVMsRUFBRSxFQUFFO1lBQ25ELHFCQUFxQjtZQUNyQixJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDcEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsSUFBSSxDQUFD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
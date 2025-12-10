"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyFlashSalePriceOverrides = applyFlashSalePriceOverrides;
exports.getFlashSalePriceOverride = getFlashSalePriceOverride;
/**
 * Apply flash sale price overrides to products
 * Checks for active flash sales and overrides prices accordingly
 */
async function applyFlashSalePriceOverrides(products, flashSaleService) {
    if (!products || products.length === 0) {
        return products;
    }
    try {
        // Get all active flash sale items
        const activeFlashSales = await flashSaleService.getActiveFlashSaleItems();
        if (activeFlashSales.length === 0) {
            return products;
        }
        // Create a map: product_id -> flash sale item
        const flashSaleMap = new Map();
        activeFlashSales.forEach((item) => {
            flashSaleMap.set(item.product_id, item);
        });
        // Apply price overrides to products
        return products.map((product) => {
            const flashSaleItem = flashSaleMap.get(product.id);
            if (!flashSaleItem) {
                return product;
            }
            // Check if product has matching variant
            const variantId = product.variant_id || (product.variants?.[0]?.id);
            if (variantId && flashSaleItem.variant_id === variantId) {
                // Apply flash sale price override
                return {
                    ...product,
                    price: flashSaleItem.flash_sale_price,
                    original_price: flashSaleItem.original_price,
                    flash_sale: {
                        active: true,
                        expires_at: flashSaleItem.expires_at,
                        flash_sale_price: flashSaleItem.flash_sale_price,
                        original_price: flashSaleItem.original_price,
                    },
                };
            }
            return product;
        });
    }
    catch (error) {
        console.error("Error applying flash sale price overrides:", error);
        return products;
    }
}
/**
 * Get flash sale price override for a single product
 */
async function getFlashSalePriceOverride(productId, variantId, flashSaleService) {
    try {
        const override = await flashSaleService.getFlashSalePriceOverride(productId, variantId);
        if (!override) {
            return null;
        }
        return {
            flash_sale_price: override.flash_sale_price,
            original_price: override.original_price,
        };
    }
    catch (error) {
        console.error("Error getting flash sale price override:", error);
        return null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJpY2Utb3ZlcnJpZGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9mbGFzaC1zYWxlL3V0aWxzL3ByaWNlLW92ZXJyaWRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBTUEsb0VBc0RDO0FBS0QsOERBdUJDO0FBdEZEOzs7R0FHRztBQUNJLEtBQUssVUFBVSw0QkFBNEIsQ0FDaEQsUUFBZSxFQUNmLGdCQUF3QztJQUV4QyxJQUFJLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdkMsT0FBTyxRQUFRLENBQUE7SUFDakIsQ0FBQztJQUVELElBQUksQ0FBQztRQUNILGtDQUFrQztRQUNsQyxNQUFNLGdCQUFnQixHQUFHLE1BQU0sZ0JBQWdCLENBQUMsdUJBQXVCLEVBQUUsQ0FBQTtRQUV6RSxJQUFJLGdCQUFnQixDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNsQyxPQUFPLFFBQVEsQ0FBQTtRQUNqQixDQUFDO1FBRUQsOENBQThDO1FBQzlDLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxFQUFzQyxDQUFBO1FBQ2xFLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFO1lBQ2hDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQTtRQUN6QyxDQUFDLENBQUMsQ0FBQTtRQUVGLG9DQUFvQztRQUNwQyxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUM5QixNQUFNLGFBQWEsR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQTtZQUVsRCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ25CLE9BQU8sT0FBTyxDQUFBO1lBQ2hCLENBQUM7WUFFRCx3Q0FBd0M7WUFDeEMsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLFVBQVUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQTtZQUVuRSxJQUFJLFNBQVMsSUFBSSxhQUFhLENBQUMsVUFBVSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUN4RCxrQ0FBa0M7Z0JBQ2xDLE9BQU87b0JBQ0wsR0FBRyxPQUFPO29CQUNWLEtBQUssRUFBRSxhQUFhLENBQUMsZ0JBQWdCO29CQUNyQyxjQUFjLEVBQUUsYUFBYSxDQUFDLGNBQWM7b0JBQzVDLFVBQVUsRUFBRTt3QkFDVixNQUFNLEVBQUUsSUFBSTt3QkFDWixVQUFVLEVBQUUsYUFBYSxDQUFDLFVBQVU7d0JBQ3BDLGdCQUFnQixFQUFFLGFBQWEsQ0FBQyxnQkFBZ0I7d0JBQ2hELGNBQWMsRUFBRSxhQUFhLENBQUMsY0FBYztxQkFDN0M7aUJBQ0YsQ0FBQTtZQUNILENBQUM7WUFFRCxPQUFPLE9BQU8sQ0FBQTtRQUNoQixDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0Q0FBNEMsRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUNsRSxPQUFPLFFBQVEsQ0FBQTtJQUNqQixDQUFDO0FBQ0gsQ0FBQztBQUVEOztHQUVHO0FBQ0ksS0FBSyxVQUFVLHlCQUF5QixDQUM3QyxTQUFpQixFQUNqQixTQUE2QixFQUM3QixnQkFBd0M7SUFFeEMsSUFBSSxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyx5QkFBeUIsQ0FDL0QsU0FBUyxFQUNULFNBQVMsQ0FDVixDQUFBO1FBRUQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2QsT0FBTyxJQUFJLENBQUE7UUFDYixDQUFDO1FBRUQsT0FBTztZQUNMLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxnQkFBZ0I7WUFDM0MsY0FBYyxFQUFFLFFBQVEsQ0FBQyxjQUFjO1NBQ3hDLENBQUE7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMENBQTBDLEVBQUUsS0FBSyxDQUFDLENBQUE7UUFDaEUsT0FBTyxJQUFJLENBQUE7SUFDYixDQUFDO0FBQ0gsQ0FBQyJ9
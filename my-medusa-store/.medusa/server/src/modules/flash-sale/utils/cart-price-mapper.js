"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapCartPricesToOriginal = mapCartPricesToOriginal;
/**
 * Map cart line items to use original_price from flash_sale_item table
 * This ensures cart always shows original prices, not flash sale prices
 */
async function mapCartPricesToOriginal(cart, flashSaleService) {
    if (!cart || !cart.items || !Array.isArray(cart.items)) {
        return cart;
    }
    const now = new Date();
    // Get all active flash sale items
    const activeFlashSales = await flashSaleService.getActiveFlashSaleItems();
    // Create a map: variant_id -> flash_sale_item
    const flashSaleMap = new Map();
    activeFlashSales.forEach((item) => {
        if (item.variant_id) {
            flashSaleMap.set(item.variant_id, item);
        }
    });
    // Map line items to use original_price
    const mappedItems = cart.items.map((item) => {
        const variant = item.variant || {};
        const variantId = variant.id || item.variant_id;
        if (!variantId) {
            return item;
        }
        const flashSaleItem = flashSaleMap.get(variantId);
        if (!flashSaleItem) {
            // Not in flash sale, return as-is
            return item;
        }
        // Product is in flash sale - use original_price for cart display
        // We need to override the price_set amounts to show original_price
        const originalPriceInMinor = Math.round(flashSaleItem.original_price * 100); // Convert to minor units (paise)
        // Override price_set if it exists
        if (item.unit_price) {
            // Update unit_price to use original_price
            item.unit_price = originalPriceInMinor;
            if (item.raw_unit_price) {
                item.raw_unit_price = {
                    ...item.raw_unit_price,
                    original: originalPriceInMinor,
                    calculated: originalPriceInMinor,
                };
            }
        }
        // Override price_set amounts
        if (item.price_set) {
            item.price_set = {
                ...item.price_set,
                original_amount: originalPriceInMinor,
                calculated_amount: originalPriceInMinor,
                presentment_amount: originalPriceInMinor,
            };
        }
        // Override variant prices if present
        if (variant.prices && Array.isArray(variant.prices)) {
            variant.prices = variant.prices.map((price) => ({
                ...price,
                amount: originalPriceInMinor,
                raw_amount: originalPriceInMinor,
            }));
        }
        // Recalculate line total based on original price
        const quantity = item.quantity || 1;
        const lineTotal = originalPriceInMinor * quantity;
        if (item.total) {
            item.total = lineTotal;
        }
        if (item.original_total) {
            item.original_total = lineTotal;
        }
        if (item.subtotal) {
            item.subtotal = lineTotal;
        }
        if (item.original_subtotal) {
            item.original_subtotal = lineTotal;
        }
        if (item.raw_total) {
            item.raw_total = {
                ...item.raw_total,
                original: lineTotal,
                calculated: lineTotal,
            };
        }
        return item;
    });
    // Recalculate cart totals
    const newSubtotal = mappedItems.reduce((sum, item) => {
        const total = item.total || item.original_total || item.subtotal || item.original_subtotal || 0;
        return sum + (typeof total === 'number' ? total : 0);
    }, 0);
    return {
        ...cart,
        items: mappedItems,
        subtotal: newSubtotal,
        total: newSubtotal + (cart.tax_total || 0) + (cart.shipping_total || 0) - (cart.discount_total || 0),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FydC1wcmljZS1tYXBwZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy9mbGFzaC1zYWxlL3V0aWxzL2NhcnQtcHJpY2UtbWFwcGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBTUEsMERBaUhDO0FBckhEOzs7R0FHRztBQUNJLEtBQUssVUFBVSx1QkFBdUIsQ0FDM0MsSUFBUyxFQUNULGdCQUF3QztJQUV4QyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDdkQsT0FBTyxJQUFJLENBQUE7SUFDYixDQUFDO0lBRUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQTtJQUV0QixrQ0FBa0M7SUFDbEMsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLGdCQUFnQixDQUFDLHVCQUF1QixFQUFFLENBQUE7SUFFekUsOENBQThDO0lBQzlDLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxFQUFzQyxDQUFBO0lBQ2xFLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ2hDLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3BCLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQTtRQUN6QyxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUE7SUFFRix1Q0FBdUM7SUFDdkMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRTtRQUMvQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQTtRQUNsQyxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsRUFBRSxJQUFJLElBQUksQ0FBQyxV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
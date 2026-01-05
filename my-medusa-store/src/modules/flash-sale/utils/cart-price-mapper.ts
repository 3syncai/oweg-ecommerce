import FlashSaleModuleService from "../service"

/**
 * Map cart line items to use original_price from flash_sale_item table
 * This ensures cart always shows original prices, not flash sale prices
 */
export async function mapCartPricesToOriginal(
  cart: any,
  flashSaleService: FlashSaleModuleService
): Promise<any> {
  if (!cart || !cart.items || !Array.isArray(cart.items)) {
    return cart
  }

  const now = new Date()
  
  // Get all active flash sale items
  const activeFlashSales = await flashSaleService.getActiveFlashSaleItems()
  
  // Create a map: variant_id -> flash_sale_item
  const flashSaleMap = new Map<string, typeof activeFlashSales[0]>()
  activeFlashSales.forEach((item) => {
    if (item.variant_id) {
      flashSaleMap.set(item.variant_id, item)
    }
  })

  // Map line items to use original_price
  const mappedItems = cart.items.map((item: any) => {
    const variant = item.variant || {}
    const variantId = variant.id || item.variant_id
    
    if (!variantId) {
      return item
    }

    const flashSaleItem = flashSaleMap.get(variantId)
    
    if (!flashSaleItem) {
      // Not in flash sale, return as-is
      return item
    }

    // Product is in flash sale - use original_price for cart display
    // We need to override the price_set amounts to show original_price
    const originalPriceInMinor = Math.round(flashSaleItem.original_price * 100) // Convert to minor units (paise)
    
    // Override price_set if it exists
    if (item.unit_price) {
      // Update unit_price to use original_price
      item.unit_price = originalPriceInMinor
      if (item.raw_unit_price) {
        item.raw_unit_price = {
          ...item.raw_unit_price,
          original: originalPriceInMinor,
          calculated: originalPriceInMinor,
        }
      }
    }

    // Override price_set amounts
    if (item.price_set) {
      item.price_set = {
        ...item.price_set,
        original_amount: originalPriceInMinor,
        calculated_amount: originalPriceInMinor,
        presentment_amount: originalPriceInMinor,
      }
    }

    // Override variant prices if present
    if (variant.prices && Array.isArray(variant.prices)) {
      variant.prices = variant.prices.map((price: any) => ({
        ...price,
        amount: originalPriceInMinor,
        raw_amount: originalPriceInMinor,
      }))
    }

    // Recalculate line total based on original price
    const quantity = item.quantity || 1
    const lineTotal = originalPriceInMinor * quantity
    
    if (item.total) {
      item.total = lineTotal
    }
    if (item.original_total) {
      item.original_total = lineTotal
    }
    if (item.subtotal) {
      item.subtotal = lineTotal
    }
    if (item.original_subtotal) {
      item.original_subtotal = lineTotal
    }

    if (item.raw_total) {
      item.raw_total = {
        ...item.raw_total,
        original: lineTotal,
        calculated: lineTotal,
      }
    }

    return item
  })

  // Recalculate cart totals
  const newSubtotal = mappedItems.reduce((sum: number, item: any) => {
    const total = item.total || item.original_total || item.subtotal || item.original_subtotal || 0
    return sum + (typeof total === 'number' ? total : 0)
  }, 0)

  return {
    ...cart,
    items: mappedItems,
    subtotal: newSubtotal,
    total: newSubtotal + (cart.tax_total || 0) + (cart.shipping_total || 0) - (cart.discount_total || 0),
  }
}


/**
 * Shared utility for applying flash sale prices to cart items
 * This ensures consistent price mapping across all cart API routes
 */

interface CartItem {
  variant?: { id?: string }
  variant_id?: string
  unit_price?: number
  price_set?: {
    original_amount?: number
    calculated_amount?: number
    presentment_amount?: number
    [key: string]: unknown
  }
  quantity?: number
  total?: number
  subtotal?: number
}

interface Cart {
  items?: CartItem[]
  subtotal?: number
  total?: number
  tax_total?: number
  shipping_total?: number
  discount_total?: number
}

interface FlashSaleProduct {
  variant_id?: string
  flash_sale_price?: number
}

interface FlashSaleData {
  active?: boolean
  products?: FlashSaleProduct[]
}

/**
 * Apply flash sale prices to cart items
 * flash_sale_price is always in rupees (major units)
 * We need to match the format of existing cart prices (minor or major units)
 * 
 * Strategy: Medusa v2 typically uses minor units (paise) for INR
 * So we convert flash_sale_price to minor units (multiply by 100)
 */
export function applyFlashSalePricesToCart(
  cart: Cart,
  flashSaleData: FlashSaleData
): Cart {
  if (!flashSaleData.active || !flashSaleData.products || !Array.isArray(flashSaleData.products)) {
    return cart
  }

  // Create map: variant_id -> flash_sale_price (in rupees)
  const priceMap = new Map<string, number>()
  flashSaleData.products.forEach((product: FlashSaleProduct) => {
    if (product.variant_id && product.flash_sale_price !== undefined) {
      priceMap.set(product.variant_id, product.flash_sale_price)
    }
  })

  if (priceMap.size === 0 || !cart.items || !Array.isArray(cart.items)) {
    return cart
  }

  // Map cart items to use flash_sale_price
  // Medusa v2 uses minor units (paise) for INR, so convert flash_sale_price to paise
  const CURRENCY_MULTIPLIER = 100 // INR: 1 rupee = 100 paise

  cart.items = cart.items.map((item: CartItem) => {
    const variantId = item.variant?.id || item.variant_id

    if (!variantId || !priceMap.has(variantId)) {
      return item
    }

    // Product is in flash sale - use flash_sale_price (discounted price) for cart display
    // flash_sale_price is in rupees (major units), convert to paise (minor units) for Medusa
    const flashSalePriceRupees = priceMap.get(variantId)!
    const priceToUse = Math.round(flashSalePriceRupees * CURRENCY_MULTIPLIER)

    // Override unit_price
    if (item.unit_price !== undefined) {
      item.unit_price = priceToUse
    }

    // Override price_set if it exists
    if (item.price_set) {
      item.price_set = {
        ...item.price_set,
        original_amount: priceToUse,
        calculated_amount: priceToUse,
        presentment_amount: priceToUse,
      }
    }

    // Recalculate line total
    const quantity = item.quantity || 1
    const lineTotal = priceToUse * quantity

    if (item.total !== undefined) {
      item.total = lineTotal
    }
    if (item.subtotal !== undefined) {
      item.subtotal = lineTotal
    }

    return item
  })

  // Recalculate cart totals
  const newSubtotal = cart.items.reduce((sum: number, item: CartItem) => {
    return sum + (item.total || item.subtotal || 0)
  }, 0)

  cart.subtotal = newSubtotal
  cart.total = newSubtotal + (cart.tax_total || 0) + (cart.shipping_total || 0) - (cart.discount_total || 0)

  return cart
}


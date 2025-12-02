import FlashSaleModuleService from "../service"

/**
 * Apply flash sale price overrides to products
 * Checks for active flash sales and overrides prices accordingly
 */
export async function applyFlashSalePriceOverrides(
  products: any[],
  flashSaleService: FlashSaleModuleService
): Promise<any[]> {
  if (!products || products.length === 0) {
    return products
  }

  try {
    // Get all active flash sale items
    const activeFlashSales = await flashSaleService.getActiveFlashSaleItems()

    if (activeFlashSales.length === 0) {
      return products
    }

    // Create a map: product_id -> flash sale item
    const flashSaleMap = new Map<string, typeof activeFlashSales[0]>()
    activeFlashSales.forEach((item) => {
      flashSaleMap.set(item.product_id, item)
    })

    // Apply price overrides to products
    return products.map((product) => {
      const flashSaleItem = flashSaleMap.get(product.id)
      
      if (!flashSaleItem) {
        return product
      }

      // Check if product has matching variant
      const variantId = product.variant_id || (product.variants?.[0]?.id)
      
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
        }
      }

      return product
    })
  } catch (error) {
    console.error("Error applying flash sale price overrides:", error)
    return products
  }
}

/**
 * Get flash sale price override for a single product
 */
export async function getFlashSalePriceOverride(
  productId: string,
  variantId: string | undefined,
  flashSaleService: FlashSaleModuleService
): Promise<{ flash_sale_price: number; original_price: number } | null> {
  try {
    const override = await flashSaleService.getFlashSalePriceOverride(
      productId,
      variantId
    )

    if (!override) {
      return null
    }

    return {
      flash_sale_price: override.flash_sale_price,
      original_price: override.original_price,
    }
  } catch (error) {
    console.error("Error getting flash sale price override:", error)
    return null
  }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import FlashSaleModuleService from "../../../../modules/flash-sale/service"
import { FLASH_SALE_MODULE } from "../../../../modules/flash-sale"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    console.log('[Flash Sale API] Starting flash sale products fetch...')
    const flashSaleService: FlashSaleModuleService = req.scope.resolve(FLASH_SALE_MODULE)
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    
    // Get all flash sale items (don't cleanup yet, just filter)
    console.log('[Flash Sale API] Fetching flash sale items...')
    const allItems = await flashSaleService.listFlashSaleItems({})
    console.log(`[Flash Sale API] Total items in DB: ${allItems.length}`)
    
    // Filter for active items (not deleted and not expired) - manual check for better control
    const now = new Date()
    console.log(`[Flash Sale API] Current time: ${now.toISOString()}`)
    
    const flashSaleItems = allItems.filter((item: any) => {
      // Skip deleted items
      if (item.deleted_at) {
        console.log(`[Flash Sale API] Item ${item.id} is deleted`)
        return false
      }
      
      // Check expiration
      const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at)
      const isActive = expiresAt > now
      
      if (!isActive) {
        console.log(`[Flash Sale API] Item ${item.id} expired: expires_at=${expiresAt.toISOString()}, now=${now.toISOString()}`)
      }
      
      return isActive
    })
    
    console.log(`[Flash Sale API] Found ${flashSaleItems.length} active flash sale items after filtering`)
    
    if (flashSaleItems.length === 0) {
      // Check all items to see why none are active
      const allItems = await flashSaleService.listFlashSaleItems({})
      console.log(`[Flash Sale API] Total flash sale items in DB: ${allItems.length}`)
      if (allItems.length > 0) {
        const now = new Date()
        allItems.forEach((item, idx) => {
          const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at)
          const isExpired = expiresAt <= now
          const isDeleted = !!item.deleted_at
          console.log(`[Flash Sale API] Item ${idx + 1}: product_id=${item.product_id}, expires_at=${expiresAt.toISOString()}, isExpired=${isExpired}, isDeleted=${isDeleted}`)
        })
      }
      
      return res.json({ 
        active: false,
        flash_sale: null,
        products: []
      })
    }
    
    // Get unique product IDs
    const productIds = Array.from(new Set(flashSaleItems.map(item => item.product_id)))
    
    console.log(`[Flash Sale API] Found ${flashSaleItems.length} flash sale items for ${productIds.length} products:`, productIds)
    
    // Fetch products - try with id filter
    let products: any[] = []
    try {
      products = await productModuleService.listProducts({
        id: productIds,
      })
      console.log(`[Flash Sale API] Fetched ${products.length} products from productModuleService`)
    } catch (error: any) {
      console.error('[Flash Sale API] Error fetching products:', error.message)
      // Try fetching one by one as fallback
      products = []
      for (const productId of productIds) {
        try {
          const product = await productModuleService.retrieveProduct(productId)
          if (product) products.push(product)
        } catch (e) {
          console.error(`[Flash Sale API] Failed to fetch product ${productId}:`, e)
        }
      }
      console.log(`[Flash Sale API] Fetched ${products.length} products using fallback method`)
    }
    
    // Create flash sale item map by product_id
    const flashSaleItemMap = new Map<string, typeof flashSaleItems[0]>()
    flashSaleItems.forEach(item => {
      flashSaleItemMap.set(item.product_id, item)
    })
    
    // Build products with flash sale prices
    const productsWithFlashSalePrices = products.map((product: any) => {
      const flashSaleItem = flashSaleItemMap.get(product.id)
      if (!flashSaleItem) {
        console.warn(`[Flash Sale API] No flash sale item found for product ${product.id}`)
        return null
      }
      
      const expiresAt = flashSaleItem.expires_at instanceof Date 
        ? flashSaleItem.expires_at 
        : new Date(flashSaleItem.expires_at)
      
      // Calculate time remaining
      const now = new Date()
      const timeRemaining = Math.max(0, expiresAt.getTime() - now.getTime())
      
      // Get variant_id from product or flash sale item
      const variantId = flashSaleItem.variant_id || product.variants?.[0]?.id || null
      
      return {
        ...product,
        variant_id: variantId, // Include variant_id for add to cart
        flash_sale_price: flashSaleItem.flash_sale_price, // Already in rupees
        original_price: flashSaleItem.original_price,     // Already in rupees
        flash_sale: {
          expires_at: expiresAt.toISOString(),
          time_remaining_ms: timeRemaining,
        }
      }
    }).filter(Boolean)
    
    console.log(`[Flash Sale API] Returning ${productsWithFlashSalePrices.length} products with flash sale prices`)
    
    // Get the earliest expiration time for the countdown
    const earliestExpiration = flashSaleItems.reduce((earliest, item) => {
      const expiresAt = item.expires_at instanceof Date 
        ? item.expires_at 
        : new Date(item.expires_at)
      return !earliest || expiresAt < earliest ? expiresAt : earliest
    }, null as Date | null)
    
    const timeRemaining = earliestExpiration 
      ? Math.max(0, earliestExpiration.getTime() - new Date().getTime())
      : 0
    
    return res.json({ 
      active: true,
      flash_sale: {
        expires_at: earliestExpiration?.toISOString() || null,
        time_remaining_ms: timeRemaining,
        item_count: flashSaleItems.length,
      },
      products: productsWithFlashSalePrices
    })
  } catch (error: any) {
    console.error("Error fetching flash sale products:", error)
    return res.json({ 
      active: false,
      flash_sale: null,
      products: []
    })
  }
}
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import FlashSaleModuleService from "../../../../modules/flash-sale/service"
import { FLASH_SALE_MODULE } from "../../../../modules/flash-sale"

/**
 * Debug endpoint to check flash sale items in database
 * Accessible at: GET /store/flash-sale/debug
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const flashSaleService: FlashSaleModuleService = req.scope.resolve(FLASH_SALE_MODULE)
    
    const now = new Date()
    const allItems = await flashSaleService.listFlashSaleItems({})
    
    const debugInfo = {
      currentTime: now.toISOString(),
      currentTimeLocal: now.toString(),
      totalItemsInDB: allItems.length,
      items: allItems.map((item: any) => {
        const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at)
        const isExpired = expiresAt <= now
        const isDeleted = !!item.deleted_at
        const isActive = !isDeleted && !isExpired
        
        return {
          id: item.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          flash_sale_price: item.flash_sale_price,
          original_price: item.original_price,
          expires_at: expiresAt.toISOString(),
          expires_at_local: expiresAt.toString(),
          deleted_at: item.deleted_at,
          isExpired,
          isDeleted,
          isActive,
          timeUntilExpiry: isActive ? Math.max(0, expiresAt.getTime() - now.getTime()) : null,
        }
      }),
      activeItemsCount: allItems.filter((item: any) => {
        if (item.deleted_at) return false
        const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at)
        return expiresAt > now
      }).length,
    }
    
    return res.json(debugInfo)
  } catch (error: any) {
    console.error("Debug endpoint error:", error)
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    })
  }
}


import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import FlashSaleModuleService from "../../../../modules/flash-sale/service"
import { FLASH_SALE_MODULE } from "../../../../modules/flash-sale"

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { id } = req.params
    const flashSaleService: FlashSaleModuleService = req.scope.resolve(FLASH_SALE_MODULE)
    
    const { product_id, price_id, expires_at } = req.body
    
    const updatedItem = await flashSaleService.updateFlashSaleItem(id, {
      product_id,
      price_id,
      expires_at,
    })
    
    return res.json({ flash_sale_item: updatedItem })
  } catch (error: any) {
    console.error("Error updating flash sale item:", error)
    if (error.type === "not_found") {
      return res.status(404).json({ 
        message: "Flash sale item not found",
        error: error.message 
      })
    }
    return res.status(500).json({ 
      message: "Failed to update flash sale item",
      error: error.message 
    })
  }
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { id } = req.params
    const flashSaleService: FlashSaleModuleService = req.scope.resolve(FLASH_SALE_MODULE)
    
    await flashSaleService.deleteFlashSaleItem(id)
    
    return res.json({ message: "Flash sale item deleted successfully" })
  } catch (error: any) {
    console.error("Error deleting flash sale item:", error)
    return res.status(500).json({ 
      message: "Failed to delete flash sale item",
      error: error.message 
    })
  }
}
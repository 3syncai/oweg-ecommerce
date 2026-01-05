import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import FlashSaleModuleService from "../../../../modules/flash-sale/service"
import { FLASH_SALE_MODULE } from "../../../../modules/flash-sale"

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { id } = req.params
    const flashSaleService: FlashSaleModuleService = req.scope.resolve(FLASH_SALE_MODULE)
    
    const { product_id, variant_id, price_id, flash_sale_price, original_price, original_price_id, expires_at } = req.body as any
    
    // Input validation
    const errors: string[] = []
    
    // Validate required fields
    if (!product_id) {
      errors.push("product_id is required")
    }
    
    // Validate numeric fields
    if (flash_sale_price !== undefined && flash_sale_price !== null) {
      if (typeof flash_sale_price !== 'number' || !Number.isFinite(flash_sale_price) || flash_sale_price < 0) {
        errors.push("flash_sale_price must be a valid positive number")
      }
    }
    
    if (original_price !== undefined && original_price !== null) {
      if (typeof original_price !== 'number' || !Number.isFinite(original_price) || original_price < 0) {
        errors.push("original_price must be a valid positive number")
      }
    }
    
    // Validate expires_at is a valid future date
    if (expires_at) {
      const expiresDate = new Date(expires_at)
      if (isNaN(expiresDate.getTime())) {
        errors.push("expires_at must be a valid date")
      } else if (expiresDate <= new Date()) {
        errors.push("expires_at must be a future date")
      }
    }
    
    // Validate ID formats (basic check - should be non-empty strings)
    if (product_id && typeof product_id !== 'string') {
      errors.push("product_id must be a string")
    }
    if (variant_id !== undefined && variant_id !== null && typeof variant_id !== 'string') {
      errors.push("variant_id must be a string")
    }
    if (price_id !== undefined && price_id !== null && typeof price_id !== 'string') {
      errors.push("price_id must be a string")
    }
    if (original_price_id !== undefined && original_price_id !== null && typeof original_price_id !== 'string') {
      errors.push("original_price_id must be a string")
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors
      })
    }
    
    const updatedItem = await flashSaleService.updateFlashSaleItem(id, {
      product_id,
      variant_id,
      flash_sale_price,
      original_price,
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
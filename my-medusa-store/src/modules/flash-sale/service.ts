import { MedusaService, MedusaError } from "@medusajs/framework/utils"
import { Modules } from "@medusajs/framework/utils"
import FlashSaleItem from "./models/flash-sale-item"

class FlashSaleModuleService extends MedusaService({
  FlashSaleItem,
}) {
  /**
   * Create a flash sale item with price override
   */
  async createFlashSaleItem(input: {
    product_id: string
    variant_id: string
    flash_sale_price: number // in rupees
    original_price: number // in rupees
    expires_at: Date | string
  }) {
    const expiresAt = typeof input.expires_at === 'string' ? new Date(input.expires_at) : input.expires_at
    const now = new Date()
    
    if (expiresAt <= now) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Expires at must be in the future"
      )
    }
    
    // Store the flash sale item (price override happens on fetch/display)
    return await this.createFlashSaleItems({
      product_id: input.product_id,
      variant_id: input.variant_id,
      flash_sale_price: input.flash_sale_price,
      original_price: input.original_price,
      original_price_id: null, // Will be set when we fetch original price
      expires_at: expiresAt,
    })
  }

  /**
   * Create multiple flash sale items (batch)
   */
  async createFlashSaleItemsBatch(input: Array<{
    product_id: string
    variant_id: string
    flash_sale_price: number
    original_price: number
    expires_at: Date | string
  }>) {
    const now = new Date()
    
    // Validate all expire in the future
    for (const item of input) {
      const expiresAt = typeof item.expires_at === 'string' ? new Date(item.expires_at) : item.expires_at
      if (expiresAt <= now) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Expires at must be in the future for product ${item.product_id}`
        )
      }
    }
    
    // Format items
    const items = input.map(item => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      flash_sale_price: item.flash_sale_price,
      original_price: item.original_price,
      original_price_id: null,
      expires_at: typeof item.expires_at === 'string' ? new Date(item.expires_at) : item.expires_at,
    }))
    
    return await super.createFlashSaleItems(items)
  }

  /**
   * Update a flash sale item
   */
  async updateFlashSaleItem(id: string, input: {
    product_id?: string
    variant_id?: string
    flash_sale_price?: number
    original_price?: number
    expires_at?: Date | string
  }) {
    const updateData: any = {}
    
    if (input.product_id !== undefined) updateData.product_id = input.product_id
    if (input.variant_id !== undefined) updateData.variant_id = input.variant_id
    if (input.flash_sale_price !== undefined) updateData.flash_sale_price = input.flash_sale_price
    if (input.original_price !== undefined) updateData.original_price = input.original_price
    
    if (input.expires_at !== undefined) {
      const expiresAt = typeof input.expires_at === 'string' ? new Date(input.expires_at) : input.expires_at
      if (expiresAt <= new Date()) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Expires at must be in the future"
        )
      }
      updateData.expires_at = expiresAt
    }
    
    updateData.updated_at = new Date()
    
    return await this.updateFlashSaleItems({ id }, updateData)
  }

  /**
   * Get active flash sale items (not expired and not deleted)
   */
  async getActiveFlashSaleItems() {
    const now = new Date()
    const allItems = await this.listFlashSaleItems({})
    
    console.log(`[FlashSaleService] Checking ${allItems.length} flash sale items...`)
    console.log(`[FlashSaleService] Current time: ${now.toISOString()}`)
    
    // Filter out expired and deleted items
    const activeItems = allItems.filter((item) => {
      if (item.deleted_at) {
        console.log(`[FlashSaleService] Item ${item.id} is deleted`)
        return false
      }
      const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at)
      const isActive = expiresAt > now
      console.log(`[FlashSaleService] Item ${item.id}: expires_at=${expiresAt.toISOString()}, isActive=${isActive}, product_id=${item.product_id}`)
      return isActive
    })
    
    console.log(`[FlashSaleService] Found ${activeItems.length} active items`)
    return activeItems
  }

  /**
   * Get flash sale items by product ID
   */
  async getFlashSaleItemsByProduct(productId: string) {
    const now = new Date()
    const items = await this.listFlashSaleItems({
      product_id: productId,
    })
    
    // Return only active items
    return items.filter((item) => {
      if (item.deleted_at) return false
      const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at)
      return expiresAt > now
    })
  }

  /**
   * Get flash sale price override for a product
   * Returns flash sale price if active, null otherwise
   */
  async getFlashSalePriceOverride(productId: string, variantId?: string) {
    const now = new Date()
    const items = await this.listFlashSaleItems({
      product_id: productId,
    })
    
    // Find active flash sale item
    const activeItem = items.find((item) => {
      if (item.deleted_at) return false
      const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at)
      if (expiresAt <= now) return false
      
      // If variant_id specified, match it; otherwise use first active item
      if (variantId) {
        return item.variant_id === variantId
      }
      return true
    })
    
    if (activeItem) {
      return {
        flash_sale_price: activeItem.flash_sale_price,
        original_price: activeItem.original_price,
        expires_at: activeItem.expires_at,
      }
    }
    
    return null
  }

  /**
   * Delete expired flash sale items (soft delete)
   */
  async cleanupExpiredItems() {
    const now = new Date()
    const allItems = await this.listFlashSaleItems({})
    
    const expiredItems = allItems.filter((item) => {
      if (item.deleted_at) return false
      const expiresAt = item.expires_at instanceof Date ? item.expires_at : new Date(item.expires_at)
      return expiresAt <= now
    })
    
    if (expiredItems.length > 0) {
      await this.updateFlashSaleItems(
        { id: expiredItems.map(item => item.id) },
        { deleted_at: now, updated_at: now }
      )
    }
    
    return expiredItems.length
  }

  /**
   * Delete a flash sale item
   */
  async deleteFlashSaleItem(id: string) {
    return await this.deleteFlashSaleItems(id)
  }
}

export default FlashSaleModuleService
import { model } from "@medusajs/framework/utils"

const FlashSaleItem = model.define("flash_sale_item", {
  id: model.id().primaryKey(),
  
  // Product ID
  product_id: model.text(),
  
  // Variant ID (for the variant we're modifying)
  variant_id: model.text(),
  
  // Flash sale price (amount in rupees)
  flash_sale_price: model.number(),
  
  // Original price (amount in rupees) - stored for restoration
  original_price: model.number(),
  
  // Original price_id (for restoring the price_set)
  original_price_id: model.text().nullable(),
  
  // Timer - when the flash sale expires
  expires_at: model.dateTime(),
})

export default FlashSaleItem

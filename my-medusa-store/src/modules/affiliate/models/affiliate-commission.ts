import { model } from "@medusajs/framework/utils"

const AffiliateCommission = model.define("affiliate_commission", {
  id: model.id().primaryKey(),

  // Commission can be set for product, category, collection, or type
  product_id: model.text().nullable(),
  category_id: model.text().nullable(),
  collection_id: model.text().nullable(),
  type_id: model.text().nullable(),

  // Commission rate as percentage (e.g., 5 for 5%)
  commission_rate: model.number(),

  // Metadata for additional info
  metadata: model.json().nullable(),
})

export default AffiliateCommission


import { model } from "@medusajs/framework/utils"

const ReturnRequestItem = model.define("return_request_item", {
  id: model.id().primaryKey(),
  return_request_id: model.text(),
  order_item_id: model.text(),
  quantity: model.number(),
  condition: model.text().nullable(),
  reason: model.text().nullable(),
  metadata: model.json().nullable(),
})

export default ReturnRequestItem

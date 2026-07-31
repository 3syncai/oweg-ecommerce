import { model } from "@medusajs/framework/utils"

const VendorReport = model.define("vendor_report", {
  id: model.id().primaryKey(),
  vendor_id: model.text(),
  order_id: model.text(),
  order_display_id: model.text().nullable(),
  return_request_id: model.text().nullable(),
  source: model.text(), // return | order_lookup
  issue_title: model.text(),
  issue_description: model.text(),
  product_snapshot: model.json().nullable(),
  order_snapshot: model.json().nullable(),
  image_urls: model.json().nullable(),
  status: model.text().default("open"), // open | in_review | resolved | closed
  admin_notes: model.text().nullable(),
  resolved_at: model.dateTime().nullable(),
  resolved_by: model.text().nullable(),
  metadata: model.json().nullable(),
})

export default VendorReport

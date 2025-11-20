import { model } from "@medusajs/framework/utils"

export type VendorDocument = {
  key: string
  url: string
  name?: string
  type?: string
}

const Vendor = model.define("vendor", {
  id: model.id().primaryKey(),

  name: model.text(),
  email: model.text().unique(),
  phone: model.text().nullable(),
  pan_gst: model.text().nullable(),
  documents: model.json().nullable(),
  store_name: model.text().nullable(),
  store_logo: model.text().nullable(),

  is_approved: model.boolean().default(false),
  approved_at: model.dateTime().nullable(),
  approved_by: model.text().nullable(),

  marketplace_seller_id: model.text().nullable(),
  metadata: model.json().nullable(),
})

export default Vendor  // ✅ Fix this - was "Vendors"
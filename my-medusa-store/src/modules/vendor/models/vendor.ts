import { model } from "@medusajs/framework/utils"

export type VendorDocument = {
  key: string
  url: string
  name?: string
  type?: string
}

const Vendor = model.define("vendor", {
  id: model.id().primaryKey(),

  // Personal Information
  name: model.text(),
  first_name: model.text().nullable(),
  last_name: model.text().nullable(),
  email: model.text().unique(),
  phone: model.text().nullable(), // Personal phone
  telephone: model.text().nullable(), // Alternative personal phone

  // Store Information
  store_name: model.text().nullable(),
  store_phone: model.text().nullable(),
  store_address: model.text().nullable(),
  store_country: model.text().nullable(),
  store_region: model.text().nullable(),
  store_city: model.text().nullable(),
  store_pincode: model.text().nullable(),
  store_logo: model.text().nullable(),
  store_banner: model.text().nullable(),
  shipping_policy: model.text().nullable(),
  return_policy: model.text().nullable(),
  whatsapp_number: model.text().nullable(),

  // Tax & Legal Information
  pan_gst: model.text().nullable(), // Combined field (legacy)
  gst_no: model.text().nullable(),
  pan_no: model.text().nullable(),

  // Banking Information
  bank_name: model.text().nullable(),
  account_no: model.text().nullable(),
  ifsc_code: model.text().nullable(),
  cancel_cheque_url: model.text().nullable(),

  // Documents
  documents: model.json().nullable(), // Array of VendorDocument

  // Approval Status
  is_approved: model.boolean().default(false),
  approved_at: model.dateTime().nullable(),
  approved_by: model.text().nullable(),
  
  // Rejection Status
  rejection_reason: model.text().nullable(),
  rejected_at: model.dateTime().nullable(),
  rejected_by: model.text().nullable(),

  // Integration
  marketplace_seller_id: model.text().nullable(),
  metadata: model.json().nullable(),
})

export default Vendor  // ✅ Fix this - was "Vendors"
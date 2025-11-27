import { model } from "@medusajs/framework/utils"

const VendorUser = model.define("vendor_user", {
  id: model.id().primaryKey(),

  email: model.text().unique(),
  password_hash: model.text(),
  last_login_at: model.dateTime().nullable(),
  must_reset_password: model.boolean().default(false),
  metadata: model.json().nullable(),

  vendor_id: model.text().nullable(),
})

export default VendorUser



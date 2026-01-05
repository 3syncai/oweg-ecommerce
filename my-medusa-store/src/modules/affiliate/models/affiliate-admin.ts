import { model } from "@medusajs/framework/utils"

const AffiliateAdmin = model.define("affiliate_admin", {
  id: model.id().primaryKey(),

  name: model.text(),
  email: model.text().unique(),
  password_hash: model.text(),
  last_login_at: model.dateTime().nullable(),
  login_ip: model.text().nullable(),
})

export default AffiliateAdmin


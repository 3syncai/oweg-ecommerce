import { model } from "@medusajs/framework/utils"

const AffiliateUser = model.define("affiliate_user", {
  id: model.id().primaryKey(),

  // Personal Information
  first_name: model.text(),
  last_name: model.text(),
  email: model.text().unique(),
  password_hash: model.text(),
  phone: model.text().nullable(),
  refer_code: model.text().nullable(),
  entry_sponsor: model.text().nullable(),
  is_agent: model.boolean().default(false),

  // Other Information
  gender: model.text().nullable(),
  father_name: model.text().nullable(),
  mother_name: model.text().nullable(),
  birth_date: model.dateTime().nullable(),
  qualification: model.text().nullable(),
  marital_status: model.text().nullable(),
  blood_group: model.text().nullable(),
  emergency_person_name: model.text().nullable(),
  emergency_person_mobile: model.text().nullable(),
  aadhar_card_no: model.text().nullable(),
  pan_card_no: model.text().nullable(),
  aadhar_card_photo: model.text().nullable(), // S3 URL
  pan_card_photo: model.text().nullable(), // S3 URL

  // Work Information
  designation: model.text().nullable(),
  sales_target: model.text().nullable(),
  branch: model.text().nullable(),
  area: model.text().nullable(),
  state: model.text().nullable(),

  // Payment Information
  payment_method: model.text().nullable(),
  bank_name: model.text().nullable(),
  bank_branch: model.text().nullable(),
  ifsc_code: model.text().nullable(),
  account_name: model.text().nullable(),
  account_number: model.text().nullable(),

  // Address
  address_1: model.text().nullable(),
  address_2: model.text().nullable(),
  city: model.text().nullable(),
  pin_code: model.text().nullable(),
  country: model.text().nullable(),
  address_state: model.text().nullable(),

  // Approval Status
  is_approved: model.boolean().default(false),
  approved_at: model.dateTime().nullable(),
  approved_by: model.text().nullable(),
  rejected_at: model.dateTime().nullable(),
  rejected_by: model.text().nullable(),
  rejection_reason: model.text().nullable(),

  // Login tracking
  last_login_at: model.dateTime().nullable(),
  login_ip: model.text().nullable(),
  metadata: model.json().nullable(),
})

export default AffiliateUser

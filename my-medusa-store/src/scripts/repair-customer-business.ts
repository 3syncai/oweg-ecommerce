/**
 * Repair a customer's business fields + OWEG group.
 *
 * Usage (from my-medusa-store):
 *   set REPAIR_EMAIL=krishnajha2k16@gmail.com
 *   set REPAIR_COMPANY=Acme Pvt Ltd
 *   set REPAIR_GST=29AAAAA0000A1Z5
 *   npx medusa exec ./src/scripts/repair-customer-business.ts
 */
import { Client } from "pg"
import {
  assignCustomerToOwegGroup,
  isValidPartnerReferralCode,
  resolveCustomerModule,
} from "../lib/customer-groups"
import { persistOwegCustomerFields } from "../lib/persist-oweg-customer-fields"

type MedusaExecArgs = {
  container: { resolve: (key: string) => unknown }
}

export default async function repairCustomerBusiness({
  container,
}: MedusaExecArgs) {
  const email = String(process.env.REPAIR_EMAIL || "")
    .trim()
    .toLowerCase()
  const company = String(process.env.REPAIR_COMPANY || "").trim()
  const gst = String(process.env.REPAIR_GST || "")
    .trim()
    .toUpperCase()

  if (!email || !company || !gst) {
    throw new Error(
      "Set REPAIR_EMAIL, REPAIR_COMPANY, and REPAIR_GST environment variables"
    )
  }
  if (!/^[0-9A-Z]{15}$/.test(gst)) {
    throw new Error("REPAIR_GST must be a 15-character GSTIN")
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  const found = await client.query(
    `SELECT id, referral_code, metadata FROM customer
     WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  )
  const customer = found.rows[0]
  if (!customer) {
    await client.end()
    throw new Error(`Customer not found: ${email}`)
  }

  const meta = (customer.metadata || {}) as Record<string, unknown>
  const referral =
    customer.referral_code ||
    (typeof meta.referral_code === "string" ? meta.referral_code : null)

  const sql = await persistOwegCustomerFields({
    customerId: customer.id,
    customer_type: "business",
    company_name: company,
    gst_number: gst,
    referral_code: referral,
    metadata: {
      ...meta,
      user_type: "business",
      company_name: company,
      gst_number: gst,
      ...(referral ? { referral_code: String(referral).toUpperCase() } : {}),
    },
  })

  if (!sql.ok) {
    await client.end()
    throw new Error(sql.error || "SQL persist failed")
  }

  const hasPartnerReferral = await isValidPartnerReferralCode(referral)
  const customerModule = resolveCustomerModule(container)
  const assigned = await assignCustomerToOwegGroup(customerModule, {
    customerId: customer.id,
    accountType: "business",
    hasPartnerReferral,
  })

  await client.end()
  console.log(
    JSON.stringify(
      {
        email,
        sql,
        hasPartnerReferral,
        group: assigned,
      },
      null,
      2
    )
  )
}

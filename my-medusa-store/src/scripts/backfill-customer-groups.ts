import { Client } from "pg"
import {
  assignCustomerToOwegGroup,
  inferOwegAccountType,
  isValidGstin,
  isValidPartnerReferralCode,
  normalizeAccountType,
  resolveCustomerModule,
} from "../lib/customer-groups"
import {
  clearJunkCustomerGstNumbers,
  syncCustomerGstTable,
} from "../lib/sync-customer-gst"

type MedusaExecArgs = {
  container: {
    resolve: (key: string) => unknown
  }
}

type CustomerRow = {
  id: string
  customer_type?: string | null
  referral_code?: string | null
  company_name?: string | null
  gst_number?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Idempotent backfill: assign each customer to exactly one of the 4 OWEG groups.
 * Only touches memberships for those 4 group keys.
 *
 * Business = real 15-char GSTIN only (never bank/cheque, never OC "Business" label alone).
 * Also syncs customer_gst from customer columns and clears junk GST values.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/backfill-customer-groups.ts
 *   npm run backfill:customer-groups
 */
export default async function backfillCustomerGroups({ container }: MedusaExecArgs) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const customerModule = resolveCustomerModule(container)
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    const clearedJunk = await clearJunkCustomerGstNumbers(client)
    console.log(
      `[backfill-customer-groups] Cleared junk customer_gst.gst_number rows: ${clearedJunk}`
    )
    const columnsResult = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'customer'`
    )
    const columns = new Set(columnsResult.rows.map((r) => r.column_name))
    const selectParts = ["id", "company_name", "metadata"]
    if (columns.has("customer_type")) selectParts.push("customer_type")
    if (columns.has("referral_code")) selectParts.push("referral_code")
    if (columns.has("gst_number")) selectParts.push("gst_number")

    const customersResult = await client.query<CustomerRow>(
      `SELECT ${selectParts.join(", ")}
       FROM customer
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC`
    )

    const referralResult = await client.query<{
      customer_id: string
      referral_code: string
    }>(`SELECT customer_id, referral_code FROM customer_referral`)

    const referralByCustomer = new Map<string, string>()
    for (const row of referralResult.rows) {
      const code = String(row.referral_code || "").trim()
      if (code) referralByCustomer.set(row.customer_id, code.toUpperCase())
    }

    /** Only GSTINs that match the 15-char signup shape. */
    const validGstByCustomer = new Map<string, string>()
    try {
      const gstResult = await client.query<{
        customer_id: string
        gst_number: string | null
      }>(
        `SELECT DISTINCT ON (customer_id) customer_id, gst_number
         FROM customer_gst
         WHERE customer_id IS NOT NULL
         ORDER BY customer_id, created_at DESC`
      )
      for (const row of gstResult.rows) {
        if (!row.customer_id) continue
        const gst = String(row.gst_number || "").trim().toUpperCase()
        if (isValidGstin(gst)) {
          validGstByCustomer.set(row.customer_id, gst)
        }
      }
    } catch (err) {
      console.warn(
        "[backfill-customer-groups] customer_gst lookup skipped:",
        err
      )
    }

    let processed = 0
    let partner = 0
    let direct = 0
    let business = 0
    let gstSynced = 0

    for (const customer of customersResult.rows) {
      const gst =
        (isValidGstin(customer.gst_number)
          ? String(customer.gst_number).trim().toUpperCase()
          : "") ||
        (typeof customer.metadata?.gst_number === "string" &&
        isValidGstin(customer.metadata.gst_number)
          ? String(customer.metadata.gst_number).trim().toUpperCase()
          : "") ||
        validGstByCustomer.get(customer.id) ||
        ""
      const company =
        String(customer.company_name || "").trim() ||
        (typeof customer.metadata?.company_name === "string"
          ? customer.metadata.company_name.trim()
          : "") ||
        ""

      const accountType = inferOwegAccountType({
        customer_type: customer.customer_type,
        metadata: customer.metadata,
        gst_number: customer.gst_number,
        customer_gst_number: validGstByCustomer.get(customer.id) || null,
      })

      const fromTable = referralByCustomer.get(customer.id) || ""
      const fromColumn = String(customer.referral_code || "").trim()
      const fromMeta =
        typeof customer.metadata?.referral_code === "string"
          ? String(customer.metadata.referral_code).trim()
          : ""
      const referralCode = (fromTable || fromColumn || fromMeta || "").toUpperCase()
      const hasPartnerReferral = await isValidPartnerReferralCode(referralCode)

      // Sync customer_type when CHECK constraints can be satisfied.
      if (
        columns.has("customer_type") &&
        normalizeAccountType(customer.customer_type) !== accountType
      ) {
        if (accountType === "individual") {
          await client.query(
            `UPDATE customer SET customer_type = 'individual', updated_at = NOW()
             WHERE id = $1`,
            [customer.id]
          )
        } else if (gst && company) {
          await client.query(
            `UPDATE customer
             SET customer_type = 'business',
                 gst_number = COALESCE(NULLIF(gst_number, ''), $2),
                 company_name = COALESCE(NULLIF(company_name, ''), $3),
                 updated_at = NOW()
             WHERE id = $1`,
            [customer.id, gst, company]
          )
        }
      }

      // Keep customer_gst table consistent for admin GST widget + invoices.
      const gstSync = await syncCustomerGstTable(client, {
        customerId: customer.id,
        gst_number: gst || null,
        company_name: company || null,
      })
      if (gstSync.action === "upserted") gstSynced += 1

      const assigned = await assignCustomerToOwegGroup(customerModule, {
        customerId: customer.id,
        accountType,
        hasPartnerReferral,
      })

      processed += 1
      if (assigned.groupKey.startsWith("partner_")) partner += 1
      else direct += 1
      if (accountType === "business") business += 1

      if (processed % 50 === 0) {
        console.log(`[backfill-customer-groups] processed ${processed}…`)
      }
    }

    console.log(
      `[backfill-customer-groups] Done. customers=${processed} partner=${partner} direct=${direct} business=${business} gstSynced=${gstSynced} junkCleared=${clearedJunk}`
    )
  } finally {
    await client.end()
  }
}

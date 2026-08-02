/**
 * Faster consistency heal than full 4k backfill:
 * 1) Clear junk customer_gst gst_number values
 * 2) Sync customer_gst for customers with real GSTIN
 * 3) Re-assign OWEG groups for partner referrals + business GST accounts
 *
 * Usage:
 *   npx medusa exec ./src/scripts/heal-customer-consistency.ts
 *   npm run heal:customer-consistency
 */
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
  container: { resolve: (key: string) => unknown }
}

export default async function healCustomerConsistency({
  container,
}: MedusaExecArgs) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const customerModule = resolveCustomerModule(container)
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    const junkCleared = await clearJunkCustomerGstNumbers(client)

    const targets = await client.query<{
      id: string
      customer_type: string | null
      company_name: string | null
      gst_number: string | null
      referral_code: string | null
      metadata: Record<string, unknown> | null
      table_referral: string | null
      table_gst: string | null
      table_business: string | null
    }>(`
      SELECT
        c.id,
        c.customer_type,
        c.company_name,
        c.gst_number,
        c.referral_code,
        c.metadata,
        cr.referral_code AS table_referral,
        g.gst_number AS table_gst,
        g.business_name AS table_business
      FROM customer c
      LEFT JOIN customer_referral cr ON cr.customer_id = c.id
      LEFT JOIN LATERAL (
        SELECT gst_number, business_name
        FROM customer_gst
        WHERE customer_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) g ON TRUE
      WHERE c.deleted_at IS NULL
        AND (
          cr.referral_code IS NOT NULL
          OR NULLIF(TRIM(c.referral_code), '') IS NOT NULL
          OR NULLIF(TRIM(c.metadata->>'referral_code'), '') IS NOT NULL
          OR c.gst_number ~* '^[0-9A-Z]{15}$'
          OR (c.metadata->>'gst_number') ~* '^[0-9A-Z]{15}$'
          OR g.gst_number ~* '^[0-9A-Z]{15}$'
          OR c.customer_type = 'business'
        )
    `)

    let processed = 0
    let business = 0
    let partner = 0
    let gstSynced = 0

    for (const customer of targets.rows) {
      const gst =
        (isValidGstin(customer.gst_number)
          ? String(customer.gst_number).trim().toUpperCase()
          : "") ||
        (typeof customer.metadata?.gst_number === "string" &&
        isValidGstin(customer.metadata.gst_number)
          ? String(customer.metadata.gst_number).trim().toUpperCase()
          : "") ||
        (isValidGstin(customer.table_gst)
          ? String(customer.table_gst).trim().toUpperCase()
          : "") ||
        ""

      const company =
        String(customer.company_name || "").trim() ||
        (typeof customer.metadata?.company_name === "string"
          ? customer.metadata.company_name.trim()
          : "") ||
        String(customer.table_business || "").trim() ||
        ""

      const accountType = inferOwegAccountType({
        customer_type: customer.customer_type,
        metadata: customer.metadata,
        gst_number: customer.gst_number,
        customer_gst_number: customer.table_gst,
      })

      if (normalizeAccountType(customer.customer_type) !== accountType) {
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

      const sync = await syncCustomerGstTable(client, {
        customerId: customer.id,
        gst_number: gst || null,
        company_name: company || null,
      })
      if (sync.action === "upserted") gstSynced += 1

      const referralCode = (
        customer.table_referral ||
        customer.referral_code ||
        (typeof customer.metadata?.referral_code === "string"
          ? customer.metadata.referral_code
          : "") ||
        ""
      )
        .toString()
        .trim()
        .toUpperCase()

      const hasPartnerReferral = await isValidPartnerReferralCode(referralCode)

      const assigned = await assignCustomerToOwegGroup(customerModule, {
        customerId: customer.id,
        accountType,
        hasPartnerReferral,
      })

      processed += 1
      if (accountType === "business") business += 1
      if (assigned.groupKey.startsWith("partner_")) partner += 1
    }

    const summary = {
      junkCleared,
      targets: targets.rows.length,
      processed,
      business,
      partner,
      gstSynced,
    }
    console.log(
      `[heal-customer-consistency] ${JSON.stringify(summary)}`
    )
  } finally {
    await client.end()
  }
}

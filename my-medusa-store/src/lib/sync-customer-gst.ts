import type { Client } from "pg"
import { isValidGstin } from "./customer-groups"

/**
 * Keep admin "GST & Bank Details" (customer_gst) aligned with customer columns.
 * - Upserts gst_number + business_name for real business GSTINs
 * - Clears junk values like "bank" / "cheque" from gst_number (keeps bank_* cols)
 */
export async function syncCustomerGstTable(
  client: Client,
  input: {
    customerId: string
    gst_number?: string | null
    company_name?: string | null
  }
): Promise<{ action: "upserted" | "cleared_junk" | "noop" }> {
  const gst = String(input.gst_number || "")
    .trim()
    .toUpperCase()
  const company = String(input.company_name || "").trim() || null
  const validGst = isValidGstin(gst) ? gst : null

  const existing = await client.query<{
    id: number
    gst_number: string | null
  }>(
    `SELECT id, gst_number
     FROM customer_gst
     WHERE customer_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.customerId]
  )

  if (validGst && company) {
    if (existing.rows[0]?.id) {
      await client.query(
        `UPDATE customer_gst
         SET gst_number = $2,
             business_name = $3,
             gst_status = COALESCE(NULLIF(TRIM(gst_status), ''), 'active')
         WHERE id = $1`,
        [existing.rows[0].id, validGst, company]
      )
    } else {
      await client.query(
        `INSERT INTO customer_gst (customer_id, gst_number, business_name, gst_status, created_at)
         VALUES ($1, $2, $3, 'active', NOW())`,
        [input.customerId, validGst, company]
      )
    }
    return { action: "upserted" }
  }

  // Clear non-GSTIN junk so the admin widget never shows bank/cheque as GST.
  if (existing.rows[0]?.id) {
    const current = String(existing.rows[0].gst_number || "").trim()
    if (current && !isValidGstin(current)) {
      await client.query(
        `UPDATE customer_gst
         SET gst_number = NULL,
             business_name = COALESCE(NULLIF(TRIM(business_name), ''), $2)
         WHERE id = $1`,
        [existing.rows[0].id, company]
      )
      return { action: "cleared_junk" }
    }
  }

  return { action: "noop" }
}

/** Null out every customer_gst.gst_number that is not a 15-char GSTIN. */
export async function clearJunkCustomerGstNumbers(
  client: Client
): Promise<number> {
  const result = await client.query(
    `UPDATE customer_gst
     SET gst_number = NULL
     WHERE gst_number IS NOT NULL
       AND TRIM(gst_number) <> ''
       AND gst_number !~* '^[0-9A-Z]{15}$'`
  )
  return result.rowCount || 0
}

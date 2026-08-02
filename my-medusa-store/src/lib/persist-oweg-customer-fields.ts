import { Client } from "pg"
import { syncCustomerGstTable } from "./sync-customer-gst"

export type OwegCustomerFields = {
  customerId: string
  customer_type: "individual" | "business" | string
  company_name?: string | null
  gst_number?: string | null
  referral_code?: string | null
  newsletter_subscribe?: boolean | null
  metadata?: Record<string, unknown> | null
}

/**
 * Force-write OWEG custom columns via SQL.
 * Medusa Create/UpdateCustomerDTO strips customer_type / gst_number;
 * module updateCustomers is unreliable for those fields.
 */
export async function persistOwegCustomerFields(
  input: OwegCustomerFields
): Promise<{
  ok: boolean
  rowCount: number
  after: {
    customer_type: string | null
    hasCompany: boolean
    hasGst: boolean
    hasReferral: boolean
    metaKeys: string[]
  } | null
  error?: string
}> {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      rowCount: 0,
      after: null,
      error: "DATABASE_URL is not set",
    }
  }

  const customerType =
    String(input.customer_type || "individual").toLowerCase() === "business"
      ? "business"
      : "individual"

  const company =
    customerType === "business"
      ? String(input.company_name || "").trim() || null
      : null
  const gst =
    customerType === "business"
      ? String(input.gst_number || "")
          .trim()
          .toUpperCase() || null
      : null
  const referral = input.referral_code
    ? String(input.referral_code).trim().toUpperCase()
    : null

  // Business CHECK requires company + gst when type is business
  if (customerType === "business" && (!company || !gst)) {
    return {
      ok: false,
      rowCount: 0,
      after: null,
      error: "business requires company_name and gst_number",
    }
  }

  const metadata = {
    ...(input.metadata || {}),
    user_type: customerType,
    ...(referral ? { referral_code: referral } : {}),
    ...(company ? { company_name: company } : {}),
    ...(gst ? { gst_number: gst } : {}),
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    const result = await client.query(
      `UPDATE customer
       SET customer_type = $2,
           company_name = $3,
           gst_number = $4,
           referral_code = COALESCE($5, referral_code),
           newsletter_subscribe = COALESCE($6, newsletter_subscribe),
           metadata = COALESCE(metadata, '{}'::jsonb) || $7::jsonb,
           updated_at = NOW()
       WHERE id = $1
         AND deleted_at IS NULL
       RETURNING customer_type, company_name, gst_number, referral_code, metadata`,
      [
        input.customerId,
        customerType,
        company,
        gst,
        referral,
        typeof input.newsletter_subscribe === "boolean"
          ? input.newsletter_subscribe
          : null,
        JSON.stringify(metadata),
      ]
    )

    // Keep admin "GST & Bank Details" widget in sync (reads customer_gst table).
    await syncCustomerGstTable(client, {
      customerId: input.customerId,
      gst_number: gst,
      company_name: company,
    })

    const row = result.rows[0]
    const rowCount = result.rowCount ?? 0
    return {
      ok: rowCount > 0,
      rowCount,
      after: row
        ? {
            customer_type: row.customer_type ?? null,
            hasCompany: Boolean(row.company_name),
            hasGst: Boolean(row.gst_number),
            hasReferral: Boolean(row.referral_code),
            metaKeys: row.metadata ? Object.keys(row.metadata) : [],
          }
        : null,
    }
  } catch (err) {
    return {
      ok: false,
      rowCount: 0,
      after: null,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await client.end().catch(() => {})
  }
}

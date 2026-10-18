import { getSharedDbPool } from "./db-pool"

export type ReplacementChoice = {
  variant_id: string
  product_id: string
  vendor_id: string
  store_name: string
  product_title: string
  variant_title: string
  sku: string
  unit_price: number
  available: number
  options: Record<string, string>
}

export type ReplacementRequest = {
  id: string
  order_id: string
  item_id: string
  customer_id: string
  customer_email: string
  original_title: string
  original_variant_id: string
  original_unit_price: number
  status: "pending" | "awaiting_payment" | "awaiting_refund" | "settling_refund" | "settlement_failed" | "applied" | "rejected" | "expired" | "failed"
  options: ReplacementChoice[]
  message: string | null
  created_by: string
  selected_variant_id: string | null
  selected_vendor_id: string | null
  selected_unit_price: number | null
  adjustment_amount: number | null
  razorpay_order_id: string | null
  razorpay_payment_id: string | null
  razorpay_refund_id: string | null
  manual_refund_reference: string | null
  responded_by: string | null
  response_source: string | null
  contact_method: string | null
  decision_email_sent_at: string | null
  decision_email_error: string | null
  response_at: string | null
  resolution_note: string | null
  email_sent_at: string | null
  email_error: string | null
  expires_at: string | null
  expiry_alert_sent_at: string | null
  consent_code_sent_at: string | null
  consent_code_expires_at: string | null
  consent_code_verified_at: string | null
  created_at: string
  updated_at: string
}

function normalize(row: ReplacementRequest) {
  // Never expose the customer proof hash through admin or customer JSON responses.
  const { consent_code_hash: _consentCodeHash, ...safeRow } = row as ReplacementRequest & { consent_code_hash?: string | null }
  return {
    ...safeRow,
    options: typeof row.options === "string" ? JSON.parse(row.options) : row.options,
    selected_unit_price: row.selected_unit_price == null ? null : Number(row.selected_unit_price),
    original_unit_price: Number(row.original_unit_price),
    adjustment_amount: row.adjustment_amount == null ? null : Number(row.adjustment_amount),
  }
}

export async function listReplacementRequests(orderId: string) {
  const result = await getSharedDbPool().query<ReplacementRequest>(
    "SELECT * FROM vendor_replacement_request WHERE order_id=$1 ORDER BY created_at DESC", [orderId]
  )
  return result.rows.map(normalize)
}

export async function getReplacementRequest(orderId: string, requestId: string) {
  const result = await getSharedDbPool().query<ReplacementRequest>(
    "SELECT * FROM vendor_replacement_request WHERE order_id=$1 AND id=$2", [orderId, requestId]
  )
  return result.rows[0] ? normalize(result.rows[0]) : null
}

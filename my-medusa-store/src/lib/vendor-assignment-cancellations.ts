import type { Pool } from "pg"
import { formatVendorOrder, pickVendorItems, type VendorOrderSettlementRates } from "./vendor-order-workflow"

export type CancelledVendorItem = {
  id: string
  product_id: string
  title: string
  variant_title: string | null
  variant_sku: string | null
  quantity: number
  unit_price: number
  reason: string
  cancelled_at: string
}

export function hasCancelledVendorAssignment(metadata: any, vendorId: string): boolean {
  return Array.isArray(metadata?.vendor_reassignment_history) &&
    metadata.vendor_reassignment_history.some((entry: any) =>
      entry?.from_vendor_id === vendorId && entry.action === "admin_cancel_and_relocate")
}

export async function loadCancelledVendorItems(pool: Pool, orderIds: string[], vendorId: string) {
  const byOrder = new Map<string, CancelledVendorItem[]>()
  if (!orderIds.length) return byOrder
  const { rows } = await pool.query<{
    order_id: string; id: string; product_id: string; title: string
    variant_title: string | null; variant_sku: string | null
    quantity: string; unit_price: string; reason: string; cancelled_at: string
  }>(`
    SELECT o.id AS order_id, oli.id, p.id AS product_id, oli.title,
      oli.variant_title, oli.variant_sku,
      entry.value->>'quantity' AS quantity, oli.unit_price,
      COALESCE(entry.value->>'reason','') AS reason,
      entry.value->>'at' AS cancelled_at
    FROM "order" o
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.metadata->'vendor_reassignment_history')='array'
        THEN o.metadata->'vendor_reassignment_history' ELSE '[]'::jsonb END
    ) AS entry(value)
    JOIN order_line_item oli ON oli.id=entry.value->>'from_item_id'
    LEFT JOIN product_variant pv ON pv.id=oli.variant_id
    JOIN product p ON p.id=COALESCE(oli.product_id,pv.product_id)
    WHERE o.id=ANY($1::text[])
      AND entry.value->>'from_vendor_id'=$2
      AND entry.value->>'action'='admin_cancel_and_relocate'
      AND p.metadata->>'vendor_id'=$2
    ORDER BY o.id, entry.value->>'at'`, [orderIds, vendorId])
  for (const row of rows) {
    const items = byOrder.get(row.order_id) || []
    items.push({ id: row.id, product_id: row.product_id, title: row.title,
      variant_title: row.variant_title, variant_sku: row.variant_sku,
      quantity: Math.max(1, Number(row.quantity) || 1), unit_price: Number(row.unit_price) || 0,
      reason: row.reason, cancelled_at: row.cancelled_at })
    byOrder.set(row.order_id, items)
  }
  return byOrder
}

export function formatVendorOrderWithCancellations(
  order: any, vendorId: string, vendorProductIds: string[],
  cancellations: CancelledVendorItem[], rates?: VendorOrderSettlementRates | null
) {
  const hasCurrentItems = pickVendorItems(order, vendorProductIds).length > 0
  const historicalItems = cancellations.map(({ reason, cancelled_at, ...item }) => item)
  const prepared = hasCurrentItems ? order : { ...order, items: historicalItems }
  const formatted = formatVendorOrder(prepared, vendorId, vendorProductIds, rates)
  const assignmentCancellations = cancellations.map(item => ({
    item_id: item.id, title: item.title, reason: item.reason, at: item.cancelled_at,
  }))
  if (hasCurrentItems) return { ...formatted, assignment_cancellations: assignmentCancellations }
  const latest = cancellations[cancellations.length - 1]
  return {
    ...formatted,
    items: historicalItems,
    product_names: historicalItems.map(item => item.title),
    total: historicalItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    vendor_stage: "cancelled",
    vendor_status_label: "Assignment cancelled by admin",
    cancelled: true,
    cancelled_by: "admin",
    cancellation_note: latest?.reason || null,
    cancellation_at: latest?.cancelled_at || null,
    cancellation_label: "Admin cancelled your assignment and moved the item to another seller.",
    acceptance_deadline_at: null,
    order_update_notice: null,
    settlement: null,
    taxable_amount: null,
    gst_amount: null,
    tcs_amount: null,
    tds_amount: null,
    commission_amount: null,
    assignment_cancellations: assignmentCancellations,
    vendor_assignment_cancelled: true,
  }
}

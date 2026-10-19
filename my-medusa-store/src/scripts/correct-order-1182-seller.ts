import type { MedusaRequest } from "@medusajs/framework/http"
import { getSharedDbPool } from "../lib/db-pool"
import { withVendorOrderAssignmentLock } from "../lib/vendor-order-assignment-lock"
import { getVendorRelocationOrder } from "../lib/vendor-relocation-order"
import { performVendorReassignment } from "../api/admin/orders/[id]/reshuffle/route"

const orderId = "order_01M582CCAKQWCZGKS69BHW32QH"
const wrongVariantId = "variant_01M57YH7CE4M069ES6G2J2T7EB"
const correctVariantId = "variant_01M57ZYKQNJB7RSDB9BQ6SKHPS"
const wrongVendorId = "01M42XEE68R9F4A0GT0YFZAHGQ"
const correctVendorId = "01KBCJRG2G3GHTD03KQYFRCCQY"

export default async function correctOrder1182Seller({ container }: { container: any }) {
  const req = { scope: container } as MedusaRequest
  const order: any = await getVendorRelocationOrder(req, orderId)
  if (order.display_id !== 1182 || ["canceled", "cancelled"].includes(String(order.status).toLowerCase()))
    throw new Error("Order #1182 is unavailable for correction")
  const item = order.items?.find((row: any) => row.variant_id === wrongVariantId && Number(row.quantity) === 1)
  if (!item || order.items?.filter((row: any) => Number(row.quantity) > 0).length !== 1 || Number(item.unit_price) !== 799)
    throw new Error("Order #1182 items changed; stop for manual review")
  if (order.fulfillments?.some((row: any) => !row.canceled_at))
    throw new Error("Order #1182 has a fulfillment")
  const decision = order.metadata?.vendor_assignment_decisions?.[0]
  if (decision?.selected_vendor_id !== wrongVendorId || decision?.reason !== "same_postal_code")
    throw new Error("Order #1182 routing audit changed; stop for manual review")
  const pool = getSharedDbPool()
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM vendor_earnings_log WHERE order_id=$1", [orderId]
  )
  if (Number(rows[0]?.count) !== 0) throw new Error("Vendor settlement has started")

  const input = {
    orderId, itemId: item.id, actorId: "system_routing_correction",
    targetVendorId: correctVendorId, targetVariantId: correctVariantId,
    reason: "Buyer selected TEST; checkout incorrectly randomized an equal-price same-PIN tie",
    systemRoutingCorrection: true,
  }
  const preview = await withVendorOrderAssignmentLock(orderId, () =>
    performVendorReassignment(req, { ...input, previewOnly: true }))
  if (preview.price_difference !== 0) throw new Error("Correction changes customer total")
  console.log(JSON.stringify({ order_id: orderId, preview, apply: process.env.APPLY_ORDER_1182_CORRECTION === "YES" }))
  if (process.env.APPLY_ORDER_1182_CORRECTION !== "YES") return

  const result = await withVendorOrderAssignmentLock(orderId, () => performVendorReassignment(req, input))
  if (result.to_vendor_id !== correctVendorId || result.vendor_cancellation_charge_status !== "waived")
    throw new Error("Correction result needs manual review")
  console.log(JSON.stringify({ corrected: result }))
}

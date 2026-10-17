import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  beginOrderEditOrderWorkflow, orderEditAddNewItemWorkflow,
  orderEditUpdateItemQuantityWorkflow, requestOrderEditRequestWorkflow,
  confirmOrderEditRequestWorkflow, cancelBeginOrderEditWorkflow,
} from "@medusajs/core-flows"
import { getSharedDbPool } from "../../../../../lib/db-pool"
import { selectSameSkuOffer } from "../../../../../lib/vendor-offer-routing"
import { getVendorWorkflow, isVendorAccepted } from "../../../../../lib/vendor-order-workflow"
import { withVendorOrderAssignmentLock } from "../../../../../lib/vendor-order-assignment-lock"
import { invalidateVendorOrderIdCache } from "../../../../../lib/vendor-order-ids"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = String(req.params?.id || "")
  const itemId = String((req.body as any)?.item_id || "")
  if (!orderId || !itemId) return res.status(400).json({ message: "Select an order item to reassign" })
  const actorId = (req as any).auth_context?.actor_id
  if (!actorId) return res.status(401).json({ message: "Admin sign-in required" })
  return withVendorOrderAssignmentLock(orderId, () => reassignOrderItem(req, res, orderId, itemId, actorId))
}

async function reassignOrderItem(req: MedusaRequest, res: MedusaResponse, orderId: string, itemId: string, actorId: string) {
  const orderModule = req.scope.resolve(Modules.ORDER)
  const pool = getSharedDbPool()
  let editActive = false
  try {
    const order: any = await orderModule.retrieveOrder(orderId, { relations: ["items", "fulfillments"] })
    if (["canceled", "cancelled"].includes(String(order.status).toLowerCase()))
      return res.status(409).json({ message: "A cancelled customer order cannot be reassigned" })
    const item: any = (order.items || []).find((row: any) => row.id === itemId)
    if (!item?.variant_id) return res.status(404).json({ message: "Order item not found" })
    const source = await pool.query<{ vendor_id: string; product_id: string }>(
      "SELECT p.metadata->>'vendor_id' AS vendor_id,p.id AS product_id FROM product_variant v JOIN product p ON p.id=v.product_id WHERE v.id=$1",
      [item.variant_id]
    )
    const from = source.rows[0]
    if (!from?.vendor_id) return res.status(409).json({ message: "This item has no vendor offer" })
    if (isVendorAccepted(getVendorWorkflow(order.metadata, from.vendor_id)))
      return res.status(409).json({ message: "The vendor already accepted this order" })
    if ((order.fulfillments || []).some((fulfillment: any) => !fulfillment.canceled_at))
      return res.status(409).json({ message: "An order with a fulfillment cannot be reassigned" })
    const earnings = await pool.query("SELECT 1 FROM vendor_earnings_log WHERE order_id=$1 LIMIT 1", [orderId])
    if (earnings.rows.length) return res.status(409).json({ message: "Vendor settlement already started. Contact accounting before reassigning." })

    const history: any[] = Array.isArray(order.metadata?.vendor_reassignment_history) ? order.metadata.vendor_reassignment_history : []
    const prior = [...history].reverse().find((entry: any) => entry.current_item_id === itemId)
    const originalItemId = prior?.original_item_id || itemId
    const excluded = [...new Set([from.vendor_id, ...history.filter((entry: any) => entry.original_item_id === originalItemId).map((entry: any) => entry.from_vendor_id)])]
    const quantity = Number(item.quantity)
    const price = Number(item.unit_price)
    const workflows = order.metadata?.vendor_order_workflows || {}
    for (const [vendorId, workflow] of Object.entries(workflows)) {
      if (isVendorAccepted(workflow as any)) excluded.push(vendorId)
    }
    const choice = await selectSameSkuOffer(item.variant_id, quantity, price, excluded)
    if (!choice) return res.status(409).json({ message: "No other approved vendor has enough stock at the same price for this SKU." })

    await beginOrderEditOrderWorkflow(req.scope).run({ input: { order_id: orderId, description: "Vendor reassignment", internal_note: `Vendor ${from.vendor_id} did not accept` } })
    editActive = true
    const { result: addedPreview } = await orderEditAddNewItemWorkflow(req.scope).run({ input: { order_id: orderId, items: [{ variant_id: choice.variant_id, quantity, unit_price: price, metadata: { oweg_reassignment_from_item_id: itemId } }] } })
    const existingIds = new Set((order.items || []).map((row: any) => row.id))
    const addedItem = (addedPreview as any).items?.find((row: any) => row.variant_id === choice.variant_id && !existingIds.has(row.id))
    if (!addedItem?.id) throw new Error("The replacement item could not be added to the order edit")
    await orderEditUpdateItemQuantityWorkflow(req.scope).run({ input: { order_id: orderId, items: [{ id: itemId, quantity: 0 }] } })
    const { result: preview } = await requestOrderEditRequestWorkflow(req.scope).run({ input: { order_id: orderId, requested_by: actorId } })
    const beforeTotal = Number(order.summary?.current_order_total ?? order.total)
    const afterTotal = Number((preview as any).total)
    if (!Number.isFinite(beforeTotal) || !Number.isFinite(afterTotal) || Math.abs(beforeTotal - afterTotal) > 0.005)
      throw new Error("Reassignment would change the customer's paid total. Choose another vendor at the same final price.")
    await confirmOrderEditRequestWorkflow(req.scope).run({ input: { order_id: orderId, confirmed_by: actorId } })
    editActive = false

    const refreshed: any = await orderModule.retrieveOrder(orderId, { relations: ["items"] })
    const replacement = (refreshed.items || []).find((row: any) => row.id === addedItem.id && row.variant_id === choice.variant_id)
    if (!replacement) throw new Error("Order edit completed, but the replacement item could not be identified")
    const orderItem = await pool.query<{ id: string }>(
      "SELECT id FROM order_item WHERE order_id=$1 AND item_id=$2 AND deleted_at IS NULL ORDER BY version DESC LIMIT 1",
      [orderId, replacement.id]
    )
    const nextHistory = [...history, {
      original_item_id: originalItemId, from_item_id: itemId, current_item_id: replacement.id,
      current_order_item_id: orderItem.rows[0]?.id || null,
      from_product_id: from.product_id, to_product_id: choice.product_id,
      from_vendor_id: from.vendor_id, to_vendor_id: choice.vendor_id,
      sku: choice.sku, quantity, unit_price: price, actor_id: actorId, at: new Date().toISOString(),
    }]
    const metadata = { ...(refreshed.metadata || {}), vendor_reassignment_history: nextHistory }
    const remaining = await pool.query(`SELECT 1 FROM order_item oi
      JOIN order_line_item oli ON oli.id=oi.item_id
      LEFT JOIN product_variant pv ON pv.id=oli.variant_id
      JOIN product p ON p.id=COALESCE(oli.product_id,pv.product_id)
      WHERE oi.order_id=$1 AND oi.version=(SELECT version FROM "order" WHERE id=$1)
        AND oi.deleted_at IS NULL AND oli.deleted_at IS NULL
        AND p.metadata->>'vendor_id'=$2 LIMIT 1`, [orderId, from.vendor_id])
    if (!remaining.rows.length && metadata.vendor_order_workflows) {
      const workflows = { ...(metadata.vendor_order_workflows as Record<string, unknown>) }
      delete workflows[from.vendor_id]
      metadata.vendor_order_workflows = workflows
    }
    await orderModule.updateOrders(orderId, { metadata })
    invalidateVendorOrderIdCache(from.vendor_id)
    invalidateVendorOrderIdCache(choice.vendor_id)
    return res.json({ order_id: orderId, from_vendor_id: from.vendor_id, to_vendor_id: choice.vendor_id, item_id: replacement.id })
  } catch (error: any) {
    if (editActive) await cancelBeginOrderEditWorkflow(req.scope).run({ input: { order_id: orderId } }).catch(() => undefined)
    console.error("[vendor-reshuffle]", error)
    const message = error?.message || "Unable to reassign order"
    return res.status(/would change the customer|not enough stock|already active/i.test(message) ? 409 : 500).json({ message })
  }
}

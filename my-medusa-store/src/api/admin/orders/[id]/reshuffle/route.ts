import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  beginOrderEditOrderWorkflow, orderEditAddNewItemWorkflow,
  orderEditUpdateItemQuantityWorkflow, requestOrderEditRequestWorkflow,
  confirmOrderEditRequestWorkflow, cancelBeginOrderEditWorkflow,
} from "@medusajs/core-flows"
import { getSharedDbPool } from "../../../../../lib/db-pool"
import { listCatalogOffers, listSameSkuOffers, selectSameSkuOffer } from "../../../../../lib/vendor-offer-routing"
import { getVendorWorkflow, getVendorWorkflows, isVendorAccepted } from "../../../../../lib/vendor-order-workflow"
import { withVendorOrderAssignmentLock } from "../../../../../lib/vendor-order-assignment-lock"
import { invalidateVendorOrderIdCache } from "../../../../../lib/vendor-order-ids"
import { getVendorVariantOptions } from "../../../../../lib/vendor-variant-options"
import { getVendorRelocationOrder } from "../../../../../lib/vendor-relocation-order"
import { chargeVendorRelocationCancellation } from "../../../../../lib/vendor-earnings"
import { getOrFreezeOrderSettlementRates } from "../../../../../lib/vendor-settlement-snapshot"
import { acceptanceDeadline } from "../../../../../lib/vendor-acceptance-deadline"
import { mergeVendorWorkflowMetadata } from "../../../../../lib/vendor-order-workflow"
import { reassignmentExcludedVendorIds } from "../../../../../lib/vendor-reassignment-exclusions"
import { normalizeOrderPublicSkus } from "../../../../../lib/order-public-sku"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = String(req.params?.id || "")
  const itemId = String((req.body as any)?.item_id || "")
  if (!orderId || !itemId) return res.status(400).json({ message: "Select an order item to reassign" })
  const actorId = (req as any).auth_context?.actor_id
  if (!actorId) return res.status(401).json({ message: "Admin sign-in required" })
  const body = (req.body || {}) as Record<string, unknown>
  try {
    const result = await withVendorOrderAssignmentLock(orderId, () => performVendorReassignment(req, {
      orderId, itemId, actorId,
      targetVendorId: String(body.target_vendor_id || "").trim(),
      targetVariantId: String(body.target_variant_id || "").trim(),
      cancelVendorAssignment: body.cancel_vendor_assignment === true,
      reason: String(body.reason || "").trim(),
    }))
    return res.json(result)
  } catch (error: any) {
    console.error("[vendor-reshuffle]", error)
    return res.status(error?.status || 500).json({ message: error?.message || "Unable to reassign order" })
  }
}

type ReassignmentInput = {
  orderId: string
  itemId: string
  actorId: string
  targetVendorId?: string
  targetVariantId?: string
  cancelVendorAssignment?: boolean
  reason?: string
  requestId?: string
  approvedBy?: string
  replacementPrice?: number
  settledAmount?: number
  previewOnly?: boolean
  /** Internal repair for a verified checkout routing error; never exposed by POST. */
  systemRoutingCorrection?: boolean
}

class ReassignmentError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = String(req.params?.id || "")
  const itemId = String(req.query?.item_id || "")
  if (!orderId || !itemId) return res.status(400).json({ message: "Select an order item" })
  if (!(req as any).auth_context?.actor_id) return res.status(401).json({ message: "Admin sign-in required" })
  try {
  const order: any = await getVendorRelocationOrder(req, orderId)
  if (["canceled", "cancelled"].includes(String(order.status).toLowerCase()))
    return res.status(409).json({ message: "A cancelled customer order cannot be relocated" })
  const item: any = (order.items || []).find((row: any) => row.id === itemId)
  if (!item?.variant_id) return res.status(404).json({ message: "Order item not found" })
  if ((order.fulfillments || []).some((fulfillment: any) => !fulfillment.canceled_at))
    return res.status(409).json({ message: "An order with a fulfillment cannot be relocated" })
  const earnings = await getSharedDbPool().query("SELECT 1 FROM vendor_earnings_log WHERE order_id=$1 LIMIT 1", [orderId])
  if (earnings.rows.length) return res.status(409).json({ message: "Vendor settlement already started. Contact accounting before relocating." })
  const source = await getSharedDbPool().query<{ vendor_id: string }>(
    "SELECT p.metadata->>'vendor_id' AS vendor_id FROM product_variant v JOIN product p ON p.id=v.product_id WHERE v.id=$1",
    [item.variant_id]
  )
  const fromVendorId = source.rows[0]?.vendor_id
  if (!fromVendorId) return res.status(409).json({ message: "This item has no vendor offer" })
  // Admin is choosing a seller explicitly. Previous assignments may still be
  // eligible; only hide the seller who currently owns the item.
  const excluded = new Set<string>([fromVendorId])
  for (const [vendorId, workflow] of Object.entries(order.metadata?.vendor_order_workflows || {})) {
    if (isVendorAccepted(workflow as any)) excluded.add(vendorId)
  }
  const quantity = Number(item.quantity)
  const unitPrice = Number(item.unit_price)
  const [catalogOffers, sameSkuOffers] = await Promise.all([
    listCatalogOffers(item.variant_id), listSameSkuOffers(item.variant_id),
  ])
  const sameSkuIds = new Set(sameSkuOffers.map((offer) => offer.variant_id))
  const eligible = catalogOffers.filter((offer) => !excluded.has(offer.vendor_id)
    && offer.available >= quantity && offer.prices.length > 0)
  const variantIds = [item.variant_id, ...eligible.map((offer) => offer.variant_id)]
  const optionsById = await getVendorVariantOptions(variantIds)
  const offered = eligible.map((offer) => ({
    vendor_id: offer.vendor_id, store_name: offer.store_name,
    vendor_name: offer.vendor_name, vendor_email: offer.vendor_email,
    variant_id: offer.variant_id, variant_title: offer.variant_title,
    product_title: offer.product_title, sku: offer.sku, available: offer.available,
    options: optionsById.get(offer.variant_id) || {},
    unit_price: offer.prices.find((price) => Math.abs(price - unitPrice) < 0.005) ?? Math.min(...offer.prices),
    same_variant: sameSkuIds.has(offer.variant_id),
  }))
  const offers = offered.filter((offer) => offer.same_variant && Math.abs(offer.unit_price - unitPrice) < 0.005)
    .sort((a, b) => b.available - a.available || a.vendor_id.localeCompare(b.vendor_id))
  const alternatives = offered.filter((offer) => !offer.same_variant || Math.abs(offer.unit_price - unitPrice) >= 0.005)
    .sort((a, b) => Math.abs(a.unit_price - unitPrice) - Math.abs(b.unit_price - unitPrice)
      || b.available - a.available || a.vendor_id.localeCompare(b.vendor_id))
  return res.json({
    quantity,
    unit_price: unitPrice,
    original_options: optionsById.get(item.variant_id) || {},
    offers,
    alternatives,
  })
  } catch (error: any) {
    console.error("[vendor-reshuffle] offer lookup failed", { orderId, itemId, error })
    return res.status(500).json({ message: error?.message || "Could not load replacement vendors" })
  }
}

export async function performVendorReassignment(req: MedusaRequest, input: ReassignmentInput) {
  const { orderId, itemId, actorId } = input
  const orderModule = req.scope.resolve(Modules.ORDER)
  const pool = getSharedDbPool()
  let editActive = false
  try {
    const order: any = await getVendorRelocationOrder(req, orderId)
    if (["canceled", "cancelled"].includes(String(order.status).toLowerCase()))
      throw new ReassignmentError("A cancelled customer order cannot be reassigned")
    const item: any = (order.items || []).find((row: any) => row.id === itemId)
    if (!item?.variant_id) throw new ReassignmentError("Order item not found", 404)
    const source = await pool.query<{ vendor_id: string; product_id: string }>(
      "SELECT p.metadata->>'vendor_id' AS vendor_id,p.id AS product_id FROM product_variant v JOIN product p ON p.id=v.product_id WHERE v.id=$1",
      [item.variant_id]
    )
    const from = source.rows[0]
    if (!from?.vendor_id) throw new ReassignmentError("This item has no vendor offer")
    const cancelVendorAssignment = input.cancelVendorAssignment === true
    const targetVendorId = input.targetVendorId || ""
    const targetVariantId = input.targetVariantId || ""
    const reason = input.reason || ""
    const workflow = getVendorWorkflow(order.metadata, from.vendor_id)
    if (cancelVendorAssignment && (!targetVendorId || reason.length < 3 || reason.length > 500))
      throw new ReassignmentError("Choose a replacement vendor and enter a reason (3–500 characters).", 400)
    if (!cancelVendorAssignment && isVendorAccepted(workflow))
      throw new ReassignmentError("The vendor already accepted this order")
    if (cancelVendorAssignment && (workflow.rtd_at || workflow.dispatched_at || workflow.shiprocket_order_id || workflow.shiprocket_awb || workflow.self_awb || workflow.tracking_number || workflow.medusa_fulfillment_id || workflow.easy_booking_status === "booked"))
      throw new ReassignmentError("This vendor has already started shipping. Cancel the shipment before relocating.")
    if ((order.fulfillments || []).some((fulfillment: any) => !fulfillment.canceled_at))
      throw new ReassignmentError("An order with a fulfillment cannot be reassigned")
    const earnings = await pool.query("SELECT 1 FROM vendor_earnings_log WHERE order_id=$1 LIMIT 1", [orderId])
    if (earnings.rows.length) throw new ReassignmentError("Vendor settlement already started. Contact accounting before reassigning.")

    const history: any[] = Array.isArray(order.metadata?.vendor_reassignment_history) ? order.metadata.vendor_reassignment_history : []
    const prior = [...history].reverse().find((entry: any) => entry.current_item_id === itemId)
    const originalItemId = prior?.original_item_id || itemId
    // Avoid retrying earlier sellers only for automatic selection. An admin's
    // explicit choice can return to a previous seller if stock and price pass.
    const excluded = reassignmentExcludedVendorIds(
      from.vendor_id, history, originalItemId, Boolean(targetVendorId || targetVariantId)
    )
    const quantity = Number(item.quantity)
    const price = Number(item.unit_price)
    const replacementPrice = input.replacementPrice ?? price
    if (!Number.isFinite(replacementPrice) || replacementPrice < 0) throw new ReassignmentError("Invalid replacement price", 400)
    const workflows = order.metadata?.vendor_order_workflows || {}
    for (const [vendorId, workflow] of Object.entries(workflows)) {
      if (isVendorAccepted(workflow as any)) excluded.push(vendorId)
    }
    const choice = targetVendorId || targetVariantId
      ? (targetVariantId ? await listCatalogOffers(item.variant_id) : await listSameSkuOffers(item.variant_id)).find((offer) => offer.vendor_id === targetVendorId
        && (!targetVariantId || offer.variant_id === targetVariantId)
        && !excluded.includes(offer.vendor_id) && offer.available >= quantity
        && offer.prices.some((amount) => Math.abs(amount - replacementPrice) < 0.005))
      : await selectSameSkuOffer(item.variant_id, quantity, price, excluded)
    if (!choice) throw new ReassignmentError("No other approved vendor has enough stock at the quoted price for this item.")
    if (Math.abs(replacementPrice - price) >= 0.005 && !input.requestId)
      throw new ReassignmentError("Customer approval and a settled price adjustment are required")

    // retrieveOrder only selected the item relation above, so it does not carry
    // the calculated total. Use the same preview calculator on both sides.
    const baseline: any = await orderModule.previewOrderChange(orderId)
    const beforeTotal = Number(baseline.summary?.current_order_total ?? baseline.total)
    if (!Number.isFinite(beforeTotal))
      throw new ReassignmentError("The current order total could not be calculated")
    const cancellationRates = input.previewOnly || input.systemRoutingCorrection ? undefined : await getOrFreezeOrderSettlementRates({
      orderId, vendorId: from.vendor_id, pool, metadata: order.metadata,
    })

    await beginOrderEditOrderWorkflow(req.scope).run({ input: { order_id: orderId,
      description: input.systemRoutingCorrection ? "Correct checkout seller routing"
        : cancelVendorAssignment ? "Admin cancelled vendor assignment and relocated item" : "Vendor reassignment",
      internal_note: input.systemRoutingCorrection ? `Correct seller from ${from.vendor_id} to ${choice.vendor_id}: ${reason}`
        : cancelVendorAssignment ? `From ${from.vendor_id} to ${choice.vendor_id}: ${reason}` : `Vendor ${from.vendor_id} did not accept` } })
    editActive = true
    const { result: addedPreview } = await orderEditAddNewItemWorkflow(req.scope).run({ input: { order_id: orderId, items: [{ variant_id: choice.variant_id, quantity, unit_price: replacementPrice, metadata: { oweg_reassignment_from_item_id: itemId } }] } })
    const existingIds = new Set((order.items || []).map((row: any) => row.id))
    const addedItem = (addedPreview as any).items?.find((row: any) => row.variant_id === choice.variant_id && !existingIds.has(row.id))
    if (!addedItem?.id) throw new Error("The replacement item could not be added to the order edit")
    await orderEditUpdateItemQuantityWorkflow(req.scope).run({ input: { order_id: orderId, items: [{ id: itemId, quantity: 0 }] } })
    const { result: preview } = await requestOrderEditRequestWorkflow(req.scope).run({ input: { order_id: orderId, requested_by: actorId } })
    const afterTotal = Number((preview as any).summary?.current_order_total ?? (preview as any).total)
    const actualDifference = Math.round((afterTotal - beforeTotal) * 100) / 100
    if (!Number.isFinite(afterTotal))
      throw new Error("The replacement order total could not be calculated")
    if (input.previewOnly) {
      await cancelBeginOrderEditWorkflow(req.scope).run({ input: { order_id: orderId } })
      editActive = false
      return { order_id: orderId, price_difference: actualDifference }
    }
    const expectedDifference = input.settledAmount ?? 0
    if (!Number.isFinite(beforeTotal) || !Number.isFinite(afterTotal) || Math.abs(actualDifference - expectedDifference) > 0.005)
      throw new Error("Order total differs from the settled amount. The replacement needs manual review.")
    await confirmOrderEditRequestWorkflow(req.scope).run({ input: { order_id: orderId, confirmed_by: actorId } })
    editActive = false
    await normalizeOrderPublicSkus(orderId, pool).catch(error =>
      console.error("[vendor-reshuffle] public SKU normalization failed", { orderId, error }))

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
      sku: choice.sku, quantity, unit_price: replacementPrice, price_adjustment: actualDifference,
      previous_variant_title: item.variant_title || null,
      new_variant_title: choice.variant_title || null,
      previous_unit_price: price,
      actor_id: actorId, at: new Date().toISOString(),
      action: input.systemRoutingCorrection ? "system_routing_correction"
        : cancelVendorAssignment ? "admin_cancel_and_relocate" : "reassign",
      vendor_cancellation_charge_status: input.systemRoutingCorrection ? "waived" : "pending",
      vendor_cancellation_charge_rates: cancellationRates,
      ...(cancelVendorAssignment || input.systemRoutingCorrection ? { reason } : {}),
      ...(input.requestId ? { replacement_request_id: input.requestId, approved_by: input.approvedBy } : {}),
    }]
    const assignedAt = new Date().toISOString()
    const metadata = mergeVendorWorkflowMetadata(
      { ...(refreshed.metadata || {}), vendor_reassignment_history: nextHistory },
      choice.vendor_id,
      { stage: "to_accept", assigned_at: assignedAt,
        acceptance_deadline_at: acceptanceDeadline(assignedAt) }
    )
    const remaining = await pool.query(`SELECT 1 FROM order_item oi
      JOIN order_line_item oli ON oli.id=oi.item_id
      LEFT JOIN product_variant pv ON pv.id=oli.variant_id
      JOIN product p ON p.id=COALESCE(oli.product_id,pv.product_id)
      WHERE oi.order_id=$1 AND oi.version=(SELECT version FROM "order" WHERE id=$1)
        AND oi.deleted_at IS NULL AND oli.deleted_at IS NULL
        AND p.metadata->>'vendor_id'=$2 LIMIT 1`, [orderId, from.vendor_id])
    if (!remaining.rows.length && metadata.vendor_order_workflows) {
      const workflows = { ...getVendorWorkflows(metadata) }
      delete workflows[from.vendor_id]
      metadata.vendor_order_workflows = workflows
    }
    await orderModule.updateOrders(orderId, { metadata })
    let chargeStatus: "recorded" | "waived" | "pending" = input.systemRoutingCorrection ? "waived" : "pending"
    if (!input.systemRoutingCorrection) {
      try {
        await chargeVendorRelocationCancellation(orderId, from.vendor_id, pool, {
          orderMetadata: order.metadata, frozenRates: cancellationRates,
        })
        // A retry may insert zero rows because the debit is already present.
        chargeStatus = Number(cancellationRates?.cancellation_charge || 0) > 0 ? "recorded" : "waived"
        nextHistory[nextHistory.length - 1].vendor_cancellation_charge_status = chargeStatus
        await orderModule.updateOrders(orderId, { metadata: { ...metadata, vendor_reassignment_history: nextHistory } })
      } catch (error) {
        console.error("[vendor-reshuffle] cancellation charge pending reconciliation", { orderId, vendorId: from.vendor_id, error })
      }
    }
    invalidateVendorOrderIdCache(from.vendor_id)
    invalidateVendorOrderIdCache(choice.vendor_id)
    return { order_id: orderId, from_vendor_id: from.vendor_id, to_vendor_id: choice.vendor_id,
      item_id: replacement.id, vendor_cancellation_charge_status: chargeStatus }
  } catch (error: any) {
    if (editActive) await cancelBeginOrderEditWorkflow(req.scope).run({ input: { order_id: orderId } }).catch(() => undefined)
    if (error instanceof ReassignmentError) throw error
    const message = error?.message || "Unable to reassign order"
    throw new ReassignmentError(message, /would change the customer|not enough stock|already active/i.test(message) ? 409 : 500)
  }
}

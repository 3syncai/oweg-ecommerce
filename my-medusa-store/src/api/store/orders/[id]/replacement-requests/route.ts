import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { listReplacementRequests } from "../../../../../lib/vendor-replacement-requests"
import { respondToVendorReplacement } from "../../../../../lib/respond-vendor-replacement"
import { createReplacementPaymentOrder, settleReplacementPayment } from "../../../../../lib/vendor-replacement-settlement"
import { withVendorOrderAssignmentLock } from "../../../../../lib/vendor-order-assignment-lock"

async function ownedOrder(req: MedusaRequest, res: MedusaResponse) {
  const customerId = String((req as any).auth_context?.actor_id || "")
  if (!customerId) {
    res.status(401).json({ message: "Customer sign-in required" })
    return null
  }
  const orderId = String(req.params?.id || "")
  const orderModule = req.scope.resolve(Modules.ORDER)
  const order: any = await orderModule.retrieveOrder(orderId)
  if (order.customer_id !== customerId) {
    res.status(403).json({ message: "This order does not belong to you" })
    return null
  }
  return { orderId, customerId }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const owner = await ownedOrder(req, res)
    if (!owner) return
    const requests = await listReplacementRequests(owner.orderId)
    return res.json({ requests: requests.map((request) => ({
      id: request.id, item_id: request.item_id, status: request.status,
      original_title: request.original_title, original_unit_price: request.original_unit_price,
      options: request.options, message: request.message,
      selected_variant_id: request.selected_variant_id,
      adjustment_amount: request.adjustment_amount,
      response_at: request.response_at, created_at: request.created_at,
      expires_at: request.expires_at,
    })) })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Could not load replacement choices" })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const owner = await ownedOrder(req, res)
    if (!owner) return
    const body = (req.body || {}) as Record<string, unknown>
    const requestId = String(body.request_id || "")
    if (body.action === "payment_order") {
      const request = (await listReplacementRequests(owner.orderId)).find((entry) => entry.id === requestId)
      if (!request || request.customer_id !== owner.customerId) return res.status(404).json({ message: "Replacement not found" })
      const result = await withVendorOrderAssignmentLock(owner.orderId,
        () => createReplacementPaymentOrder(owner.orderId, requestId))
      return res.json(result)
    }
    if (body.action === "verify_payment") {
      const result = await withVendorOrderAssignmentLock(owner.orderId, () => settleReplacementPayment(
        req, owner.orderId, requestId, {
          payment_id: String(body.razorpay_payment_id || ""),
          razorpay_order_id: String(body.razorpay_order_id || ""),
          razorpay_signature: String(body.razorpay_signature || ""),
        }))
      return res.json(result)
    }
    const decision = String(body.decision || "")
    const variantId = String(body.variant_id || "")
    if (!requestId || !["accept", "reject"].includes(decision))
      return res.status(400).json({ message: "Choose an alternative or reject the request" })
    const result = await respondToVendorReplacement({
      req, orderId: owner.orderId, requestId, actorId: owner.customerId,
      source: "customer", decision: decision as "accept" | "reject", variantId,
    })
    return res.json(result)
  } catch (error: any) {
    return res.status(error?.status || 500).json({ message: error?.message || "Could not save your choice" })
  }
}

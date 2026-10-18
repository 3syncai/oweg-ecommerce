import { createHmac, timingSafeEqual } from "node:crypto"
import type { MedusaRequest } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { getSharedDbPool } from "./db-pool"
import { getReplacementRequest } from "./vendor-replacement-requests"
import { performVendorReassignment } from "../api/admin/orders/[id]/reshuffle/route"

type GatewayOrder = { id: string; amount: number; currency: string }
type GatewayPayment = { id: string; order_id: string; amount: number; currency: string; status: string }
type GatewayRefund = { id: string; payment_id: string; amount: number; status: string }
type GatewayOrderPayments = { items: GatewayPayment[] }

function credentials() {
  const id = process.env.RAZORPAY_KEY_ID
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!id || !secret) throw new Error("Razorpay payment adjustment is not configured")
  return { id, secret }
}

async function gateway<T>(path: string, method: "GET" | "POST" = "GET", body?: object, key?: string): Promise<T> {
  const { id, secret } = credentials()
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(key ? { "X-Razorpay-Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Payment gateway adjustment failed (${response.status})`)
  return await response.json() as T
}

function minor(amount: number) { return Math.round(amount * 100) }

export async function createReplacementPaymentOrder(orderId: string, requestId: string) {
  const request = await getReplacementRequest(orderId, requestId)
  if (!request || request.status !== "awaiting_payment" || !request.adjustment_amount || request.adjustment_amount <= 0)
    throw new Error("This replacement is not awaiting an additional payment")
  if (request.razorpay_order_id) {
    return { order_id: request.razorpay_order_id, amount_minor: minor(request.adjustment_amount),
      key_id: credentials().id }
  }
  const created = await gateway<GatewayOrder>("orders", "POST", {
    amount: minor(request.adjustment_amount), currency: "INR",
    receipt: request.id.slice(0, 40), notes: { order_id: orderId, replacement_request_id: request.id },
  })
  if (created.amount !== minor(request.adjustment_amount) || created.currency !== "INR")
    throw new Error("Payment gateway returned an unexpected amount")
  await getSharedDbPool().query(`UPDATE vendor_replacement_request SET razorpay_order_id=$2,updated_at=now()
    WHERE id=$1 AND status='awaiting_payment' AND razorpay_order_id IS NULL`, [request.id, created.id])
  return { order_id: created.id, amount_minor: created.amount, key_id: credentials().id }
}

async function applySettledReplacement(req: MedusaRequest, orderId: string, requestId: string,
  referenceId: string, reference: "vendor_replacement_payment" | "vendor_replacement_refund") {
  const request = await getReplacementRequest(orderId, requestId)
  if (!request?.selected_variant_id || !request.selected_vendor_id || request.selected_unit_price == null
    || request.adjustment_amount == null) throw new Error("Replacement selection is missing")
  try {
    const orderModule = req.scope.resolve(Modules.ORDER)
    const order: any = await orderModule.retrieveOrder(orderId)
    const history: any[] = Array.isArray(order.metadata?.vendor_reassignment_history)
      ? order.metadata.vendor_reassignment_history : []
    const previous = history.find((entry) => entry.replacement_request_id === request.id)
    const reassigned = previous ? {
      order_id: orderId, from_vendor_id: previous.from_vendor_id,
      to_vendor_id: previous.to_vendor_id, item_id: previous.current_item_id,
    } : await performVendorReassignment(req, {
      orderId, itemId: request.item_id, actorId: request.created_by,
      targetVendorId: request.selected_vendor_id, targetVariantId: request.selected_variant_id,
      cancelVendorAssignment: true, reason: "Customer-approved replacement after payment adjustment",
      requestId: request.id, approvedBy: request.responded_by || request.customer_id,
      replacementPrice: request.selected_unit_price, settledAmount: request.adjustment_amount,
    })
    const existing = await getSharedDbPool().query(`SELECT 1 FROM order_transaction
      WHERE order_id=$1 AND reference_id=$2 LIMIT 1`, [orderId, referenceId])
    if (!existing.rows.length) await orderModule.addOrderTransactions({
      order_id: orderId, amount: request.adjustment_amount,
      currency_code: "inr", reference, reference_id: referenceId,
    })
    await getSharedDbPool().query(`UPDATE vendor_replacement_request SET status='applied',updated_at=now()
      WHERE id=$1`, [request.id])
    return { status: "applied" as const, reassigned }
  } catch (error: any) {
    await getSharedDbPool().query(`UPDATE vendor_replacement_request SET status='settlement_failed',
      resolution_note=LEFT(CONCAT(COALESCE(resolution_note,''), E'\nSettlement: ', $2::text),500),updated_at=now()
      WHERE id=$1`, [request.id, error?.message || "Order edit failed"])
    throw error
  }
}

export async function retrySettledReplacement(req: MedusaRequest, orderId: string, requestId: string) {
  const request = await getReplacementRequest(orderId, requestId)
  if (!request || request.status !== "settlement_failed" || !request.adjustment_amount)
    throw new Error("No settled replacement needs retrying")
  if (request.adjustment_amount > 0 && request.razorpay_payment_id) {
    const payment = await gateway<GatewayPayment>(`payments/${encodeURIComponent(request.razorpay_payment_id)}`)
    if (payment.status !== "captured" || payment.amount !== minor(request.adjustment_amount)
      || payment.order_id !== request.razorpay_order_id) throw new Error("Payment is not captured at the quoted amount")
    return applySettledReplacement(req, orderId, request.id, payment.id, "vendor_replacement_payment")
  }
  if (request.adjustment_amount < 0 && request.razorpay_refund_id) {
    const refund = await gateway<GatewayRefund>(`refunds/${encodeURIComponent(request.razorpay_refund_id)}`)
    if (refund.status !== "processed" || refund.amount !== minor(-request.adjustment_amount))
      throw new Error("Refund has not finished processing")
    return applySettledReplacement(req, orderId, request.id, refund.id, "vendor_replacement_refund")
  }
  if (request.adjustment_amount < 0 && request.manual_refund_reference)
    return applySettledReplacement(req, orderId, request.id,
      request.manual_refund_reference, "vendor_replacement_refund")
  throw new Error("Payment adjustment reference is missing. Reconcile with Razorpay first.")
}

export async function recordManualReplacementRefund(req: MedusaRequest, orderId: string, requestId: string,
  referenceId: string, note: string, actorId: string) {
  const request = await getReplacementRequest(orderId, requestId)
  if (!request || request.status !== "awaiting_refund" || !request.adjustment_amount
    || request.adjustment_amount >= 0) throw new Error("No manual refund is pending")
  if (referenceId.trim().length < 5 || note.trim().length < 5)
    throw new Error("Enter the completed refund reference and a contact note")
  await getSharedDbPool().query(`UPDATE vendor_replacement_request SET manual_refund_reference=$2,
    resolution_note=LEFT(CONCAT(COALESCE(resolution_note,''), E'\nManual refund by ', $3::text, ': ', $4::text),500),
    updated_at=now() WHERE id=$1 AND status='awaiting_refund'`,
    [request.id, referenceId.trim(), actorId, note.trim()])
  return applySettledReplacement(req, orderId, request.id, referenceId.trim(), "vendor_replacement_refund")
}

export async function settleReplacementPayment(req: MedusaRequest, orderId: string, requestId: string,
  input: { payment_id: string; razorpay_order_id: string; razorpay_signature: string }) {
  const request = await getReplacementRequest(orderId, requestId)
  if (!request || !["awaiting_payment", "settlement_failed", "applied"].includes(request.status)
    || !request.razorpay_order_id
    || !request.adjustment_amount) throw new Error("This payment is not expected for the replacement")
  if (request.razorpay_order_id !== input.razorpay_order_id) throw new Error("Payment order mismatch")
  const signature = createHmac("sha256", credentials().secret)
    .update(`${input.razorpay_order_id}|${input.payment_id}`).digest("hex")
  if (!/^[a-f0-9]{64}$/i.test(input.razorpay_signature)
    || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(input.razorpay_signature, "hex")))
    throw new Error("Invalid payment signature")
  const payment = await gateway<GatewayPayment>(`payments/${encodeURIComponent(input.payment_id)}`)
  if (payment.id !== input.payment_id || payment.order_id !== request.razorpay_order_id
    || payment.status !== "captured" || payment.currency !== "INR"
    || payment.amount !== minor(request.adjustment_amount))
    throw new Error("Additional payment is not captured at the quoted amount")
  if (request.status === "applied") return { status: "applied" as const }
  if (request.status === "settlement_failed") {
    if (request.razorpay_payment_id !== payment.id) throw new Error("Payment reference does not match")
    return retrySettledReplacement(req, orderId, request.id)
  }
  await getSharedDbPool().query(`UPDATE vendor_replacement_request SET razorpay_payment_id=$2,updated_at=now()
    WHERE id=$1 AND status='awaiting_payment'`, [request.id, payment.id])
  return applySettledReplacement(req, orderId, request.id, payment.id, "vendor_replacement_payment")
}

export async function recoverReplacementPayment(req: MedusaRequest, orderId: string, requestId: string) {
  const request = await getReplacementRequest(orderId, requestId)
  if (!request || request.status !== "awaiting_payment" || !request.razorpay_order_id
    || !request.adjustment_amount) return { status: "awaiting_payment" as const }
  const payments = await gateway<GatewayOrderPayments>(`orders/${encodeURIComponent(request.razorpay_order_id)}/payments`)
  const adjustment = request.adjustment_amount
  const captured = payments.items?.find((payment) => payment.status === "captured"
    && payment.order_id === request.razorpay_order_id && payment.currency === "INR"
    && payment.amount === minor(adjustment))
  if (!captured) return { status: "awaiting_payment" as const }
  await getSharedDbPool().query(`UPDATE vendor_replacement_request SET razorpay_payment_id=$2,updated_at=now()
    WHERE id=$1 AND status='awaiting_payment'`, [request.id, captured.id])
  return applySettledReplacement(req, orderId, request.id, captured.id, "vendor_replacement_payment")
}

export async function settleReplacementRefund(req: MedusaRequest, orderId: string, requestId: string) {
  const request = await getReplacementRequest(orderId, requestId)
  if (!request || !["awaiting_refund", "settling_refund"].includes(request.status)
    || request.adjustment_amount == null || request.adjustment_amount >= 0)
    throw new Error("This replacement is not awaiting a refund")
  const orderModule = req.scope.resolve(Modules.ORDER)
  const order: any = await orderModule.retrieveOrder(orderId)
  const originalPaymentId = String(order.metadata?.razorpay_payment_id || "")
  if (!originalPaymentId) throw new Error("Original online payment not found. Admin must arrange the refund before reassignment.")
  const original = await gateway<GatewayPayment>(`payments/${encodeURIComponent(originalPaymentId)}`)
  if (original.status !== "captured" || original.currency !== "INR")
    throw new Error("Original payment is not eligible for an automatic refund")
  const amount = minor(-request.adjustment_amount)
  let refund: GatewayRefund
  if (request.razorpay_refund_id) {
    refund = await gateway<GatewayRefund>(`refunds/${encodeURIComponent(request.razorpay_refund_id)}`)
  } else {
    if (request.status === "settling_refund")
      throw new Error("Refund outcome needs reconciliation in Razorpay before retrying")
    await getSharedDbPool().query(`UPDATE vendor_replacement_request SET status='settling_refund',updated_at=now()
      WHERE id=$1 AND status='awaiting_refund'`, [request.id])
    refund = await gateway<GatewayRefund>(`payments/${encodeURIComponent(originalPaymentId)}/refund`, "POST",
      { amount, speed: "normal", notes: { order_id: orderId, replacement_request_id: request.id } })
    await getSharedDbPool().query(`UPDATE vendor_replacement_request SET status='settling_refund',
      razorpay_refund_id=$2,updated_at=now() WHERE id=$1`, [request.id, refund.id])
  }
  if (refund.payment_id !== originalPaymentId || refund.amount !== amount)
    throw new Error("Refund amount or original payment does not match")
  if (refund.status !== "processed") return { status: "settling_refund" as const,
    message: "The refund has been submitted and is processing. Reassignment will follow once it is processed." }
  return applySettledReplacement(req, orderId, request.id, refund.id, "vendor_replacement_refund")
}

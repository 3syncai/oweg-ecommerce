import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
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

/** Mirror a verified Razorpay adjustment in Medusa's payment collection.
 * Order transactions alone update paid_total but not the admin capture badge.
 */
export async function recordCapturedReplacementPayment(orderId: string, requestId: string) {
  const request = await getReplacementRequest(orderId, requestId)
  if (!request?.razorpay_payment_id || !request.razorpay_order_id ||
    !request.adjustment_amount || request.adjustment_amount <= 0)
    throw new Error("Captured replacement payment reference is missing")
  const gatewayPayment = await gateway<GatewayPayment>(`payments/${encodeURIComponent(request.razorpay_payment_id)}`)
  if (gatewayPayment.id !== request.razorpay_payment_id ||
    gatewayPayment.order_id !== request.razorpay_order_id ||
    gatewayPayment.status !== "captured" || gatewayPayment.currency !== "INR" ||
    gatewayPayment.amount !== minor(request.adjustment_amount))
    throw new Error("Replacement payment is not captured at the quoted amount")

  const amount = request.adjustment_amount
  const raw = JSON.stringify({ value: amount.toFixed(2), precision: 20 })
  const pool = getSharedDbPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [gatewayPayment.id])
    const existing = await client.query(`SELECT p.id FROM payment p
      JOIN order_payment_collection opc ON opc.payment_collection_id=p.payment_collection_id
      WHERE opc.order_id=$1 AND opc.deleted_at IS NULL AND p.deleted_at IS NULL
        AND p.data->>'razorpay_payment_id'=$2 LIMIT 1`, [orderId, gatewayPayment.id])
    if (existing.rows.length) { await client.query("COMMIT"); return }
    const collections = await client.query<{ id: string }>(`SELECT pc.id FROM payment_collection pc
      JOIN order_payment_collection opc ON opc.payment_collection_id=pc.id
      WHERE opc.order_id=$1 AND opc.deleted_at IS NULL AND pc.deleted_at IS NULL
        AND pc.currency_code='inr' AND pc.amount=$2 AND pc.status='not_paid'
        AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.payment_collection_id=pc.id AND p.deleted_at IS NULL)
      FOR UPDATE OF pc`, [orderId, amount])
    if (collections.rows.length !== 1)
      throw new Error("Replacement payment collection is missing or ambiguous")
    const collectionId = collections.rows[0].id
    const sessionId = `payses_${randomUUID().replace(/-/g, "")}`
    const paymentId = `pay_${randomUUID().replace(/-/g, "")}`
    const data = JSON.stringify({ status: "captured", captured: true,
      amount_in_paise: gatewayPayment.amount, razorpay_order_id: gatewayPayment.order_id,
      razorpay_payment_id: gatewayPayment.id, replacement_request_id: requestId })
    await client.query(`INSERT INTO payment_session
      (id,currency_code,amount,raw_amount,provider_id,data,context,status,payment_collection_id,created_at,updated_at)
      VALUES($1,'inr',$2,$3::jsonb,'razorpay',$4::jsonb,'{}'::jsonb,'captured',$5,now(),now())`,
      [sessionId, amount, raw, data, collectionId])
    await client.query(`INSERT INTO payment
      (id,amount,raw_amount,currency_code,provider_id,data,payment_collection_id,payment_session_id,captured_at,created_at,updated_at)
      VALUES($1,$2,$3::jsonb,'inr','razorpay',$4::jsonb,$5,$6,now(),now(),now())`,
      [paymentId, amount, raw, data, collectionId, sessionId])
    await client.query(`INSERT INTO capture(id,amount,raw_amount,payment_id,metadata,created_at,updated_at)
      VALUES($1,$2,$3::jsonb,$4,$5::jsonb,now(),now())`,
      [`capt_${randomUUID().replace(/-/g, "")}`, amount, raw, paymentId,
        JSON.stringify({ razorpay_payment_id: gatewayPayment.id, replacement_request_id: requestId })])
    await client.query(`UPDATE payment_collection SET captured_amount=$2,
      raw_captured_amount=$3::jsonb,status='completed',updated_at=now() WHERE id=$1`,
      [collectionId, amount, raw])
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally { client.release() }
}

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
    if (reference === "vendor_replacement_payment")
      await recordCapturedReplacementPayment(orderId, requestId)
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

/** Refund the original captured Razorpay payment before cancelling a rejected order.
 * The recorded refund lets Medusa's cancel workflow skip a second gateway refund.
 */
export async function refundRejectedReplacementOrder(orderId: string, requestId: string,
  metadata: Record<string, any>) {
  const gatewayPaymentId = String(metadata.razorpay_payment_id || "")
  const gatewayOrderId = String(metadata.razorpay_order_id || "")
  if (!gatewayPaymentId || !gatewayOrderId || metadata.razorpay_payment_status !== "captured")
    throw new Error("Original payment must be verified before cancellation")
  const payment = await gateway<GatewayPayment>(`payments/${encodeURIComponent(gatewayPaymentId)}`)
  if (payment.id !== gatewayPaymentId || payment.order_id !== gatewayOrderId ||
    payment.status !== "captured" || payment.currency !== "INR" ||
    payment.amount !== Number(metadata.razorpay_amount_minor))
    throw new Error("Original payment does not match the captured order amount")

  const pool = getSharedDbPool()
  const stored = await pool.query<{ id: string; refunded: string }>(`
    SELECT p.id, COALESCE((SELECT SUM(r.amount) FROM refund r
      WHERE r.payment_id=p.id AND r.deleted_at IS NULL),0)::text AS refunded
    FROM payment p JOIN order_payment_collection opc ON opc.payment_collection_id=p.payment_collection_id
    WHERE opc.order_id=$1 AND opc.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.data->>'razorpay_payment_id'=$2 LIMIT 1`, [orderId, gatewayPaymentId])
  const medusaPayment = stored.rows[0]
  if (!medusaPayment) throw new Error("Captured payment record is missing; contact support")
  const amount = payment.amount / 100
  if (Number(medusaPayment.refunded) >= amount - 0.005) return
  if (Number(medusaPayment.refunded) > 0) throw new Error("A partial refund exists; contact support")

  const request = await getReplacementRequest(orderId, requestId)
  let refund: GatewayRefund
  if (request?.razorpay_refund_id) {
    refund = await gateway<GatewayRefund>(`refunds/${encodeURIComponent(request.razorpay_refund_id)}`)
  } else {
    refund = await gateway<GatewayRefund>(`payments/${encodeURIComponent(gatewayPaymentId)}/refund`, "POST",
      { amount: payment.amount, speed: "normal", notes: { order_id: orderId, replacement_request_id: requestId,
        reason: "customer_declined_replacement" } }, `replacement-reject:${requestId}`)
    await pool.query(`UPDATE vendor_replacement_request SET razorpay_refund_id=$2,updated_at=now()
      WHERE id=$1 AND razorpay_refund_id IS NULL`, [requestId, refund.id])
  }
  if (refund.payment_id !== gatewayPaymentId || refund.amount !== payment.amount ||
    !["processed", "pending", "created"].includes(refund.status))
    throw new Error("The cancellation refund needs support review")
  await pool.query(`INSERT INTO refund(id,amount,raw_amount,payment_id,metadata,note,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,now(),now())`, [
    `refund_${randomUUID()}`, amount, JSON.stringify({ value: amount.toFixed(2), precision: 20 }),
    medusaPayment.id, JSON.stringify({ razorpay_refund_id: refund.id, replacement_request_id: requestId,
      gateway_status: refund.status }), "Customer declined replacement",
  ])
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

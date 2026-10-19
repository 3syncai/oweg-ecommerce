import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { respondToVendorReplacement } from "../../../../../../lib/respond-vendor-replacement"
import { recordManualReplacementRefund, retrySettledReplacement, settleReplacementRefund } from "../../../../../../lib/vendor-replacement-settlement"
import { withVendorOrderAssignmentLock } from "../../../../../../lib/vendor-order-assignment-lock"
import { getSharedDbPool } from "../../../../../../lib/db-pool"
import { getReplacementRequest } from "../../../../../../lib/vendor-replacement-requests"
import { sendVendorReplacementRequestEmail, sendVendorReplacementDecisionEmail } from "../../../../../../lib/vendor-replacement-mailer"
import { Modules } from "@medusajs/framework/utils"
import { sendReplacementConsentCode } from "../../../../../../lib/vendor-replacement-consent"
import { notifyReplacementOutcome } from "../../../../../../lib/vendor-replacement-outcome"

async function notifyIfFinal(req: MedusaRequest, orderId: string, requestId: string, status: string) {
  if (status !== "applied" && status !== "rejected") return
  try { await notifyReplacementOutcome(req, orderId, requestId) }
  catch (error) { console.error("[replacement] outcome email failed", { orderId, requestId, error }) }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const actorId = String((req as any).auth_context?.actor_id || "")
  if (!actorId) return res.status(401).json({ message: "Admin sign-in required" })
  const body = (req.body || {}) as Record<string, unknown>
  const decision = String(body.decision || "")
  const variantId = String(body.variant_id || "")
  const note = String(body.note || "").trim().slice(0, 500)
  const contactMethod = String(body.contact_method || "")
  const orderId = String(req.params?.id || "")
  const requestId = String(req.params?.request_id || "")
  if (body.action === "send_consent_code") {
    try {
      const result = await sendReplacementConsentCode(orderId, requestId, variantId)
      return res.json(result)
    } catch (error: any) {
      return res.status(409).json({ message: error?.message || "Could not send customer code" })
    }
  }
  if (body.action === "record_manual_refund") {
    try {
      const result = await withVendorOrderAssignmentLock(orderId, () => recordManualReplacementRefund(
        req, orderId, requestId, String(body.reference_id || ""), note, actorId))
      await notifyIfFinal(req, orderId, requestId, result.status)
      return res.json(result)
    } catch (error: any) {
      return res.status(409).json({ message: error?.message || "Could not record completed refund" })
    }
  }
  if (body.action === "resend_email") {
    try {
      const request = await getReplacementRequest(orderId, requestId)
      if (!request || request.status !== "pending") throw new Error("Only pending requests can be emailed")
      if (request.expires_at && new Date(request.expires_at).getTime() <= Date.now())
        throw new Error("This request has expired. Create a new replacement offer")
      const orderModule = req.scope.resolve(Modules.ORDER)
      const order: any = await orderModule.retrieveOrder(orderId)
      await sendVendorReplacementRequestEmail({
        to: request.customer_email, orderId, displayId: order.display_id,
        originalTitle: request.original_title, originalPrice: request.original_unit_price,
        options: request.options, note: request.message, expiresAt: request.expires_at,
      })
      await getSharedDbPool().query(`UPDATE vendor_replacement_request SET email_sent_at=now(),
        email_error=NULL,updated_at=now() WHERE id=$1`, [request.id])
      return res.json({ email_sent: true })
    } catch (error: any) {
      return res.status(409).json({ message: error?.message || "Could not email customer" })
    }
  }
  if (body.action === "resend_decision_email") {
    try {
      const request = await getReplacementRequest(orderId, requestId)
      if (!request || request.response_source !== "admin" || !["applied", "rejected", "awaiting_payment", "awaiting_refund", "settling_refund", "settlement_failed"].includes(request.status))
        throw new Error("No recorded admin decision to confirm")
      const selected = request.options.find((option) => option.variant_id === request.selected_variant_id)
      await sendVendorReplacementDecisionEmail({
        to: request.customer_email, orderId, title: request.original_title,
        decision: request.status === "rejected" ? "reject" : "accept",
        variant: selected?.variant_title, unitPrice: selected?.unit_price,
        contactMethod: request.contact_method || "phone",
      })
      await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
        decision_email_sent_at=now(),decision_email_error=NULL,updated_at=now() WHERE id=$1`, [requestId])
      return res.json({ email_sent: true })
    } catch (error: any) {
      return res.status(409).json({ message: error?.message || "Could not confirm customer decision" })
    }
  }
  if (body.action === "resend_outcome_email") {
    try {
      const request = await getReplacementRequest(orderId, requestId)
      if (!request || !["applied", "rejected"].includes(request.status))
        throw new Error("The replacement has no completed outcome to confirm")
      await notifyReplacementOutcome(req, orderId, requestId)
      const updated = await getReplacementRequest(orderId, requestId)
      return res.json({ customer_email_sent: Boolean(updated?.outcome_customer_email_sent_at),
        vendor_email_sent: Boolean(updated?.outcome_vendor_email_sent_at),
        customer_email_error: updated?.outcome_customer_email_error,
        vendor_email_error: updated?.outcome_vendor_email_error })
    } catch (error: any) {
      return res.status(409).json({ message: error?.message || "Could not resend outcome emails" })
    }
  }
  if (body.action === "retry_assignment") {
    try {
      const result = await withVendorOrderAssignmentLock(orderId,
        () => retrySettledReplacement(req, orderId, requestId))
      await notifyIfFinal(req, orderId, requestId, result.status)
      return res.json(result)
    } catch (error: any) {
      return res.status(409).json({ message: error?.message || "Assignment needs review" })
    }
  }
  if (body.action === "check_refund") {
    try {
      const result = await withVendorOrderAssignmentLock(orderId, async () => {
        const request = await getReplacementRequest(orderId, requestId)
        if (!request) throw new Error("Replacement request not found")
        const refundId = String(body.refund_id || "").trim()
        if (request.status === "settling_refund" && !request.razorpay_refund_id && refundId) {
          await getSharedDbPool().query(`UPDATE vendor_replacement_request SET razorpay_refund_id=$2,
            resolution_note=$3,updated_at=now() WHERE id=$1 AND status='settling_refund'`,
            [request.id, refundId, `Admin reconciled Razorpay refund: ${note || actorId}`])
        }
        return settleReplacementRefund(req, orderId, requestId)
      })
      await notifyIfFinal(req, orderId, requestId, result.status)
      return res.json(result)
    } catch (error: any) {
      return res.status(409).json({ message: error?.message || "Refund is not ready" })
    }
  }
  if (!["accept", "reject"].includes(decision) || note.length < 15
    || !["phone", "whatsapp", "email", "in_person"].includes(contactMethod))
    return res.status(400).json({ message: "Record the contact method and at least 15 characters of customer consent evidence" })
  try {
    const result = await respondToVendorReplacement({
      req, orderId, requestId, actorId,
      source: "admin", decision: decision as "accept" | "reject", variantId, note,
      contactMethod: contactMethod as "phone" | "whatsapp" | "email" | "in_person",
      consentCode: String(body.consent_code || "").trim(),
    })
    await notifyIfFinal(req, orderId, requestId, result.status)
    let customerConfirmation: "sent" | "pending" = "pending"
    try {
      const request = await getReplacementRequest(orderId, requestId)
      if (request) {
        const selected = request.options.find((option) => option.variant_id === variantId)
        await sendVendorReplacementDecisionEmail({
          to: request.customer_email, orderId, title: request.original_title,
          decision: decision as "accept" | "reject",
          variant: selected?.variant_title, unitPrice: selected?.unit_price,
          contactMethod,
        })
        await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
          decision_email_sent_at=now(),decision_email_error=NULL,updated_at=now() WHERE id=$1`, [requestId])
        customerConfirmation = "sent"
      }
    } catch (error: any) {
      await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
        decision_email_error=$2,updated_at=now() WHERE id=$1`,
        [requestId, error?.message || "Customer confirmation email failed"]).catch((logError) =>
          console.error("[vendor-replacement] could not log confirmation email failure", logError))
    }
    return res.json({ ...result, customer_confirmation: customerConfirmation })
  } catch (error: any) {
    return res.status(error?.status || 500).json({ message: error?.message || "Could not record customer decision" })
  }
}

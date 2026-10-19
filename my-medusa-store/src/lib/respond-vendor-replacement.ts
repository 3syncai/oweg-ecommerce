import type { MedusaRequest } from "@medusajs/framework/http"
import { cancelOrderWorkflow } from "@medusajs/core-flows"
import { Modules } from "@medusajs/framework/utils"
import { getSharedDbPool } from "./db-pool"
import { listCatalogOffers } from "./vendor-offer-routing"
import { withVendorOrderAssignmentLock } from "./vendor-order-assignment-lock"
import { getReplacementRequest } from "./vendor-replacement-requests"
import { performVendorReassignment } from "../api/admin/orders/[id]/reshuffle/route"
import { refundRejectedReplacementOrder, settleReplacementRefund } from "./vendor-replacement-settlement"
import { verifyReplacementConsentCode } from "./vendor-replacement-consent"
import { chargeVendorRelocationCancellation, reverseVendorEarningsForOrder } from "./vendor-earnings"

export class ReplacementResponseError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export async function respondToVendorReplacement(input: {
  req: MedusaRequest
  orderId: string
  requestId: string
  actorId: string
  source: "customer" | "admin"
  decision: "accept" | "reject"
  variantId?: string
  note?: string
  contactMethod?: "phone" | "whatsapp" | "email" | "in_person"
  consentCode?: string
}) {
  return withVendorOrderAssignmentLock(input.orderId, async () => {
    const request = await getReplacementRequest(input.orderId, input.requestId)
    if (!request) throw new ReplacementResponseError("Replacement request not found", 404)
    if (request.status !== "pending") throw new ReplacementResponseError("This request has already been answered")
    if (input.source === "admin" && (!input.contactMethod || (input.note || "").trim().length < 15))
      throw new ReplacementResponseError("Record the contact method and detailed customer consent evidence (at least 15 characters).", 400)
    if (request.expires_at && new Date(request.expires_at).getTime() <= Date.now()) {
      await getSharedDbPool().query(`UPDATE vendor_replacement_request SET status='expired',updated_at=now()
        WHERE id=$1 AND status='pending'`, [request.id])
      throw new ReplacementResponseError("This offer expired. Ask support for a new choice.")
    }
    const orderModule = input.req.scope.resolve(Modules.ORDER)
    const order: any = await orderModule.retrieveOrder(input.orderId, { relations: ["items"] })
    if (input.source === "customer" && order.customer_id !== input.actorId)
      throw new ReplacementResponseError("This order does not belong to the signed-in customer", 403)
    if (["canceled", "cancelled"].includes(String(order.status).toLowerCase()))
      throw new ReplacementResponseError("The order is cancelled")
    const item = (order.items || []).find((entry: any) => entry.id === request.item_id)
    if (!item || item.variant_id !== request.original_variant_id)
      throw new ReplacementResponseError("The original order item has changed. Ask support for a new offer.")

    if (input.decision === "reject") {
      const metadata = { ...(order.metadata || {}) }
      const isCod = String(metadata.payment_method || "").toLowerCase() === "cod"
      if (!isCod) await refundRejectedReplacementOrder(input.orderId, request.id, metadata)
      await orderModule.updateOrders(input.orderId, { metadata: {
        ...metadata,
        customer_cancel_reason: "Customer declined the proposed replacement",
        cancellation_reason: "Customer declined the proposed replacement",
        cancellation_note: "Customer declined the proposed replacement",
        cancellation_source: "customer",
        cancelled_by: "customer",
        cancelled_by_admin: false,
        cancellation_requested_at: new Date().toISOString(),
        cancellation_requested_by: input.actorId,
      } })
      await cancelOrderWorkflow(input.req.scope).run({
        input: { order_id: input.orderId, canceled_by: input.actorId },
      })
      await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
        status='rejected', responded_by=$2, response_source=$3, response_at=now(),
        resolution_note=$4, contact_method=$5, updated_at=now() WHERE id=$1 AND status='pending'`,
        [request.id, input.actorId, input.source, input.note || null, input.contactMethod || null])
      await getSharedDbPool().query(`UPDATE vendor_replacement_request SET status='expired',updated_at=now()
        WHERE order_id=$1 AND id<>$2 AND status='pending'`, [input.orderId, request.id])
      await reverseVendorEarningsForOrder(input.orderId, getSharedDbPool(), "replacement-rejected")
        .catch((error) => console.error("[replacement] cancelled order earnings reversal needs review", {
          orderId: input.orderId, requestId: request.id, error,
        }))
      const originalVendor = await getSharedDbPool().query<{ vendor_id: string }>(
        `SELECT p.metadata->>'vendor_id' AS vendor_id FROM product_variant pv
         JOIN product p ON p.id=pv.product_id WHERE pv.id=$1`, [request.original_variant_id])
      if (originalVendor.rows[0]?.vendor_id) {
        await chargeVendorRelocationCancellation(input.orderId, originalVendor.rows[0].vendor_id,
          getSharedDbPool(), { orderMetadata: metadata })
          .catch((error) => console.error("[replacement] original vendor cancellation charge needs review", {
            orderId: input.orderId, requestId: request.id, error,
          }))
      }
      return { status: "rejected" as const }
    }

    const choice = request.options.find((option) => option.variant_id === input.variantId)
    if (!choice) throw new ReplacementResponseError("Choose one of the offered alternatives", 400)
    if (input.source === "admin") {
      try {
        await verifyReplacementConsentCode(request.id, choice.variant_id, input.consentCode || "")
      } catch (error: any) {
        throw new ReplacementResponseError(error?.message || "Customer confirmation code required", 400)
      }
    }
    const available = (await listCatalogOffers(request.original_variant_id)).find((offer) =>
      offer.variant_id === choice.variant_id && offer.vendor_id === choice.vendor_id
      && offer.available >= Number(item.quantity)
      && offer.prices.some((price) => Math.abs(price - choice.unit_price) < 0.005))
    if (!available) throw new ReplacementResponseError("That alternative is no longer in stock at the quoted price. Ask support for another choice.")

    if (Math.abs(choice.unit_price - request.original_unit_price) >= 0.005) {
      const quote = await performVendorReassignment(input.req, {
        orderId: input.orderId, itemId: request.item_id, actorId: request.created_by,
        targetVendorId: choice.vendor_id, targetVariantId: choice.variant_id,
        cancelVendorAssignment: true,
        reason: "Preview customer-approved replacement",
        requestId: request.id, replacementPrice: choice.unit_price, previewOnly: true,
      })
      const adjustment = Number(quote.price_difference)
      if (!Number.isFinite(adjustment) || Math.abs(adjustment) < 0.005)
        throw new ReplacementResponseError("The replacement total could not be quoted. Ask support to review the order.")
      if (String(order.metadata?.payment_method || "").toLowerCase() === "cod") {
        if (order.metadata?.cod_status !== "confirmed")
          throw new ReplacementResponseError("The COD order is not confirmed")
        const reassigned = await performVendorReassignment(input.req, {
          orderId: input.orderId, itemId: request.item_id, actorId: request.created_by,
          targetVendorId: choice.vendor_id, targetVariantId: choice.variant_id,
          cancelVendorAssignment: true,
          reason: input.note && input.note.length >= 3 ? input.note : "Customer approved COD replacement",
          requestId: request.id, approvedBy: input.actorId,
          replacementPrice: choice.unit_price, settledAmount: adjustment,
        })
        await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
          status='applied', adjustment_amount=$2, selected_variant_id=$3, selected_vendor_id=$4,
          selected_unit_price=$5, responded_by=$6, response_source=$7, response_at=now(),
          resolution_note=$8, contact_method=$9,updated_at=now()
          WHERE id=$1 AND status='pending'`, [request.id, adjustment, choice.variant_id,
          choice.vendor_id, choice.unit_price, input.actorId, input.source,
          input.note || null, input.contactMethod || null])
        return { status: "applied" as const, reassigned, price_difference: adjustment }
      }
      const status = adjustment > 0 ? "awaiting_payment" : "awaiting_refund"
      await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
        status=$8, adjustment_amount=$9, selected_variant_id=$2, selected_vendor_id=$3,
        selected_unit_price=$4, responded_by=$5, response_source=$6,
        response_at=now(), resolution_note=$7, contact_method=$10,
        consent_code_hash=NULL,consent_code_verified_at=CASE WHEN $6='admin' THEN now() ELSE NULL END,
        updated_at=now()
        WHERE id=$1 AND status='pending'`,
        [request.id, choice.variant_id, choice.vendor_id, choice.unit_price,
          input.actorId, input.source, input.note || null, status, adjustment, input.contactMethod || null])
      if (adjustment < 0) {
        try {
          return await settleReplacementRefund(input.req, input.orderId, request.id)
        } catch (error: any) {
          return { status: "awaiting_refund" as const, price_difference: adjustment,
            message: error?.message || "Refund needs admin review" }
        }
      }
      return { status: "awaiting_payment" as const, price_difference: adjustment }
    }

    const reassigned = await performVendorReassignment(input.req, {
      orderId: input.orderId,
      itemId: request.item_id,
      actorId: request.created_by,
      targetVendorId: choice.vendor_id,
      targetVariantId: choice.variant_id,
      cancelVendorAssignment: true,
      reason: input.note && input.note.length >= 3 ? input.note
        : `${input.source === "admin" ? "Admin recorded" : "Customer"} approval of replacement request`,
      requestId: request.id,
      approvedBy: input.actorId,
    })
    await getSharedDbPool().query(`UPDATE vendor_replacement_request SET
      status='applied', selected_variant_id=$2, selected_vendor_id=$3,
      selected_unit_price=$4, responded_by=$5, response_source=$6,
      response_at=now(), resolution_note=$7, contact_method=$8,
      consent_code_hash=NULL,consent_code_verified_at=CASE WHEN $6='admin' THEN now() ELSE NULL END,
      updated_at=now()
      WHERE id=$1 AND status='pending'`,
      [request.id, choice.variant_id, choice.vendor_id, choice.unit_price,
        input.actorId, input.source, input.note || null, input.contactMethod || null])
    return { status: "applied" as const, reassigned }
  })
}

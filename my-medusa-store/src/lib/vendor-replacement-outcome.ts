import type { MedusaRequest } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../modules/vendor"
import VendorModuleService from "../modules/vendor/service"
import { getSharedDbPool } from "./db-pool"
import { getReplacementRequest } from "./vendor-replacement-requests"
import { sendReplacementOutcomeEmail } from "./vendor-replacement-mailer"

/** Send final outcome notices only after reassignment or cancellation completes. */
export async function notifyReplacementOutcome(req: MedusaRequest, orderId: string, requestId: string) {
  const request = await getReplacementRequest(orderId, requestId)
  if (!request || !["applied", "rejected"].includes(request.status)) return
  const orderModule = req.scope.resolve(Modules.ORDER)
  const order: any = await orderModule.retrieveOrder(orderId)
  if (request.status === "rejected" && !["canceled", "cancelled"].includes(String(order.status))) return
  const vendorId = request.status === "applied" ? request.selected_vendor_id :
    (await getSharedDbPool().query<{ vendor_id: string }>(
      `SELECT p.metadata->>'vendor_id' AS vendor_id FROM product_variant pv
       JOIN product p ON p.id=pv.product_id WHERE pv.id=$1`, [request.original_variant_id]
    )).rows[0]?.vendor_id
  let vendor: any = null
  if (vendorId) {
    try { vendor = await (req.scope.resolve(VENDOR_MODULE) as VendorModuleService).retrieveVendor(vendorId) }
    catch (error) { console.warn("[replacement-outcome] vendor lookup failed", { orderId, requestId, error }) }
  }
  const selected = request.options.find((option) => option.variant_id === request.selected_variant_id)
  const paymentMethod = String(order.metadata?.payment_method).toLowerCase() === "cod" ? "cod" : "prepaid"
  const common = {
    orderId, displayId: order.display_id, outcome: request.status as "applied" | "rejected",
    productTitle: request.original_title, replacementTitle: selected?.product_title,
    paymentMethod: paymentMethod as "cod" | "prepaid",
  }
  const pool = getSharedDbPool()
  if (!request.outcome_customer_email_sent_at && request.customer_email) {
    try {
      await sendReplacementOutcomeEmail({ ...common, to: request.customer_email, role: "customer" })
      await pool.query(`UPDATE vendor_replacement_request SET outcome_customer_email_sent_at=now(),
        outcome_customer_email_error=NULL,updated_at=now() WHERE id=$1`, [requestId])
    } catch (error: any) {
      await pool.query(`UPDATE vendor_replacement_request SET outcome_customer_email_error=$2,
        updated_at=now() WHERE id=$1`, [requestId, error?.message || "Customer email failed"])
    }
  }
  if (!request.outcome_vendor_email_sent_at) {
    try {
      if (!vendor?.email) throw new Error("Vendor email is unavailable")
      await sendReplacementOutcomeEmail({ ...common, to: vendor.email, role: "vendor" })
      await pool.query(`UPDATE vendor_replacement_request SET outcome_vendor_email_sent_at=now(),
        outcome_vendor_email_error=NULL,updated_at=now() WHERE id=$1`, [requestId])
    } catch (error: any) {
      await pool.query(`UPDATE vendor_replacement_request SET outcome_vendor_email_error=$2,
        updated_at=now() WHERE id=$1`, [requestId, error?.message || "Vendor email failed"])
    }
  }
}

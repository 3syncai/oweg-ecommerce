import { getSharedDbPool } from "../lib/db-pool"
import { withVendorOrderAssignmentLock } from "../lib/vendor-order-assignment-lock"
import { recoverReplacementPayment, settleReplacementRefund } from "../lib/vendor-replacement-settlement"

/** Reconcile gateway callbacks and finished refunds after customer approval. */
export default async function reconcileVendorReplacements(container: any) {
  const logger = container.resolve("logger")
  const pending = await getSharedDbPool().query<{ id: string; order_id: string; status: string }>(`
    SELECT id,order_id,status FROM vendor_replacement_request
    WHERE (status='awaiting_payment' AND razorpay_order_id IS NOT NULL)
       OR (status='settling_refund' AND razorpay_refund_id IS NOT NULL)
    ORDER BY updated_at ASC LIMIT 50`)
  for (const request of pending.rows) {
    try {
      const reqLike = { scope: container } as any
      await withVendorOrderAssignmentLock(request.order_id, async () => {
        if (request.status === "awaiting_payment")
          await recoverReplacementPayment(reqLike, request.order_id, request.id)
        else await settleReplacementRefund(reqLike, request.order_id, request.id)
      })
    } catch (error: any) {
      logger.warn(`[replacement-reconcile] request=${request.id}: ${error?.message}`)
    }
  }
}

export const config = { name: "reconcile-vendor-replacements", schedule: "*/10 * * * *" }

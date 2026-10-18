import { getSharedDbPool } from "../lib/db-pool"
import { hasPasswordResetMailerConfig } from "../lib/password-reset/config"
import { sendTransactionalEmail } from "../lib/password-reset/mailer"
import { withVendorOrderAssignmentLock } from "../lib/vendor-order-assignment-lock"

/** Expired offers stay visible to admin; acceptance is also blocked at request time. */
export default async function expireVendorReplacementRequests(container: any) {
  const logger = container.resolve("logger")
  const pool = getSharedDbPool()
  await pool.query(`
    UPDATE vendor_replacement_request
      SET status='expired', updated_at=now()
    WHERE id IN (
      SELECT id FROM vendor_replacement_request
      WHERE status='pending' AND expires_at IS NOT NULL AND expires_at<=now()
      ORDER BY expires_at ASC LIMIT 50
    ) AND status='pending'`)
  const alertEmail = process.env.VENDOR_ASSIGNMENT_ALERT_EMAIL?.trim()
  const expired = await pool.query<{ id: string; order_id: string }>(`
    SELECT id,order_id FROM vendor_replacement_request
    WHERE status='expired' AND expires_at IS NOT NULL
      AND expiry_alert_sent_at IS NULL
    ORDER BY expires_at ASC LIMIT 50`)
  for (const request of expired.rows) {
    logger.warn(`[vendor-replacement-expired] order=${request.order_id} request=${request.id}; admin action needed`)
    if (!alertEmail || !hasPasswordResetMailerConfig()) continue
    try {
      await withVendorOrderAssignmentLock(request.order_id, async () => {
        const current = await pool.query<{ status: string; expiry_alert_sent_at: string | null }>(
          "SELECT status,expiry_alert_sent_at FROM vendor_replacement_request WHERE id=$1", [request.id])
        if (current.rows[0]?.status !== "expired" || current.rows[0]?.expiry_alert_sent_at) return
        await sendTransactionalEmail({
          to: alertEmail,
          subject: `Customer replacement choice expired for ${request.order_id}`,
          heading: "Customer choice expired",
          intro: `The customer did not respond to the replacement offer for order ${request.order_id}.`,
          paragraphs: ["Contact the customer, offer another available choice, or cancel the order. The proposed change has not been applied."],
        })
        await pool.query(`UPDATE vendor_replacement_request SET expiry_alert_sent_at=now()
          WHERE id=$1`, [request.id])
      })
    } catch (error: any) {
      logger.warn(`[vendor-replacement-expired] email failed for ${request.id}: ${error?.message}`)
    }
  }
}

export const config = { name: "expire-vendor-replacement-requests", schedule: "*/10 * * * *" }

import { randomUUID } from "node:crypto"
import { Modules } from "@medusajs/framework/utils"
import { getSharedDbPool } from "../../lib/db-pool"
import { decryptPayload, encryptPayload, InteraktError, isOrderSuccessfullyCancelled, notificationPayload, sendInteraktTemplate, templateFor, type NotificationEvent } from "./interakt.service"
type Database = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> }
async function recipient(container: any, orderId: string, cancellationOnly = false) {
  const order = await container.resolve(Modules.ORDER).retrieveOrder(orderId, { relations: ["shipping_address"] })
  if (cancellationOnly && !isOrderSuccessfullyCancelled(order)) return { order, customer: null }
  const customer = order.customer_id ? await container.resolve(Modules.CUSTOMER).retrieveCustomer(order.customer_id) : null
  return { order, customer }
}
export async function enqueueNotification(container: any, orderId: string, event: NotificationEvent, trackingUrl?: string | null, database?: Database) {
  if (process.env.INTERAKT_ENABLED !== "true") return
  const db = database || getSharedDbPool()
  const { order, customer } = await recipient(container, orderId, event === "order_cancelled")
  // Do not reserve the unique event key for an uncompleted/failed cancellation.
  if (event === "order_cancelled" && !isOrderSuccessfullyCancelled(order)) return
  let payload: ReturnType<typeof notificationPayload> | null = null
  let error: string | null = null
  try { payload = notificationPayload(order, customer, event, trackingUrl) }
  catch (err) { if (!(err instanceof InteraktError)) throw err; error = err.code }
  const encrypted = payload ? encryptPayload(payload) : null
  await db.query(`INSERT INTO whatsapp_notification_log
    (id, order_id, customer_id, event_type, recipient_phone, payload_encrypted, template_name, status, error_details)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (order_id,event_type) DO NOTHING`,
    [randomUUID(), orderId, order.customer_id || null, event, payload ? `******${payload.phone.slice(-4)}` : null,
      encrypted, templateFor(event), error ? "FAILED" : "PENDING", error])
}
export async function processNotificationOutbox(database?: Database, request: typeof fetch = fetch, logger: Pick<Console, "info" | "warn"> = console, container?: any) {
  if (process.env.INTERAKT_ENABLED !== "true") return
  const db = database || getSharedDbPool()
  // Crashed workers may already have sent. Quarantine stale claims instead of resending.
  await db.query(`UPDATE whatsapp_notification_log SET status='FAILED', error_details='worker_outcome_unknown',
    updated_at=now() WHERE status='PENDING' AND processing_at < now() - interval '5 minutes'`)
  for (let i = 0; i < 20; i++) {
    const { rows } = await db.query(`UPDATE whatsapp_notification_log SET processing_at=now(),
      attempts=attempts+1, updated_at=now() WHERE id=(
        SELECT id FROM whatsapp_notification_log WHERE status='PENDING' AND deleted_at IS NULL AND processing_at IS NULL
          AND next_attempt_at<=now() AND attempts<5 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) RETURNING *`)
    const row = rows[0]
    if (!row) break
    let messageId: string
    try {
      let payload = decryptPayload(row.payload_encrypted)
      if (container) {
        let latest: Awaited<ReturnType<typeof recipient>>
        try { latest = await recipient(container, row.order_id) }
        catch { throw new InteraktError("recipient_lookup_failed", true) }
        const { order, customer } = latest
        // Recheck the registered phone immediately before a delayed send or retry.
        const current = notificationPayload(order, customer, row.event_type, payload.bodyValues[2])
        if (current.phone !== payload.phone) throw new InteraktError("registered_phone_changed")
        payload = current
      }
      messageId = await sendInteraktTemplate(payload.phone, row.template_name, payload.bodyValues, row.id, request)
    } catch (err) {
      const failure = err instanceof InteraktError ? err : new InteraktError("payload_unavailable")
      const retry = failure.retryable && row.attempts < 5
      await db.query(`UPDATE whatsapp_notification_log SET status=$2,error_details=$3,
        processing_at=NULL,next_attempt_at=now()+($4 * interval '1 second'),updated_at=now()
        WHERE id=$1 AND status='PENDING'`,
        [row.id, retry ? "PENDING" : "FAILED", failure.code, Math.min(3600, 60 * 2 ** row.attempts)])
      logger.warn(JSON.stringify({ component: "interakt", notification_id: row.id, outcome: retry ? "retry_scheduled" : "failed", code: failure.code }))
      continue
    }
    // A DB failure after API acceptance must never schedule a second send.
    await db.query(`UPDATE whatsapp_notification_log SET status='SENT', interakt_message_id=$2,
      delivery_status='ACCEPTED',error_details=NULL,processing_at=NULL,updated_at=now() WHERE id=$1`, [row.id, messageId])
    logger.info(JSON.stringify({ component: "interakt", notification_id: row.id, outcome: "accepted" }))
  }
}

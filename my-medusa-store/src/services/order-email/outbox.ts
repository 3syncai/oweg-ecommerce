import { createHash, randomUUID } from "node:crypto"
import { getSharedDbPool } from "../../lib/db-pool"
import { renderOrderEmail, storefrontOrigin, type OrderEmailEvent } from "./template"

type Database = Pick<ReturnType<typeof getSharedDbPool>, "query">
type Logger = Pick<Console, "warn">
type Source = { orderId: string } | { fulfillmentId: string }
const MAX_ATTEMPTS = 8
const RETRY_WINDOW_MS = 20 * 60 * 60 * 1000

export async function enqueueOrderEmail(
  source: Source,
  event: OrderEmailEvent,
  database?: Database
) {
  if (process.env.ORDER_EMAIL_ENABLED !== "true") return
  const db = database ?? getSharedDbPool()
  const orderId = "orderId" in source ? source.orderId : null
  const fulfillmentId = "fulfillmentId" in source ? source.fulfillmentId : null
  await db.query(
    `INSERT INTO oweg_order_email_outbox (id, order_id, event_type)
     SELECT $1, o.id, $2 FROM "order" o
     WHERE o.id = COALESCE($3, (
       SELECT link.order_id FROM order_fulfillment link
       JOIN fulfillment f ON f.id = link.fulfillment_id AND f.deleted_at IS NULL
       WHERE link.fulfillment_id = $4 AND link.deleted_at IS NULL AND f.canceled_at IS NULL
       AND (($2 = 'order_shipped' AND f.shipped_at IS NOT NULL)
         OR ($2 = 'order_delivered' AND f.delivered_at IS NOT NULL))
       LIMIT 1
     ))
     AND o.deleted_at IS NULL AND o.is_draft_order IS FALSE
     AND o.no_notification IS NOT TRUE
     AND COALESCE(o.metadata->>'checkout_duplicate_suppressed', '') <> 'true'
     AND (($2 = 'order_cancelled') = (o.status::text IN ('canceled', 'cancelled')))
     ON CONFLICT (order_id, event_type) DO NOTHING`,
    [randomUUID(), event, orderId, fulfillmentId]
  )
}

// These sources already committed their tracking status. Email failures should
// remain isolated from shipping, payment and the WhatsApp integration.
export async function recordTrackingEmail(orderId: string, event: OrderEmailEvent, logger: Logger = console) {
  try {
    await enqueueOrderEmail({ orderId }, event)
  } catch {
    logger.warn(`[order-email] tracking enqueue failed event=${event} order=${orderId}`)
  }
}

class SendError extends Error {
  constructor(
    public code: string,
    public retryable: boolean,
    public delaySeconds = 0
  ) {
    super(code)
  }
}

async function sendEmail(body: string, id: string, key: string, request: typeof fetch) {
  let response: Response
  try {
    response = await request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `oweg-order-email/${id}`,
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    throw new SendError("provider_connection", true)
  }

  if (!response.ok) {
    const details = response.status === 409 ? await response.json().catch(() => null) : null
    const retryable = response.status >= 500 || [408, 429].includes(response.status) ||
      details?.name === "concurrent_idempotent_requests"
    const retryAfter = response.headers.get("retry-after")
    const delay = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 0
    await response.body?.cancel().catch(() => {})
    throw new SendError(`provider_http_${response.status}`, retryable, delay)
  }

  const result = await response.json().catch(() => null)
  if (typeof result?.id !== "string" || !result.id || result.id.length > 128) {
    throw new SendError("provider_receipt_missing", true)
  }
  return result.id
}

type OutboxRow = {
  id: string
  order_id: string
  event_type: OrderEmailEvent
  attempts: number
  first_attempt_at: Date
  request_hash: string | null
}

export async function processOrderEmails(
  database?: Database,
  request: typeof fetch = fetch,
  logger: Logger = console
) {
  if (process.env.ORDER_EMAIL_ENABLED !== "true") return
  const key = process.env.RESEND_API_KEY?.trim()
  const from = process.env.RESEND_FROM?.trim()
  if (!key || !from) throw new Error("missing_email_provider_config")
  const origin = storefrontOrigin(process.env.ORDER_EMAIL_STOREFRONT_URL || process.env.STOREFRONT_URL)
  const db = database ?? getSharedDbPool()

  const deadline = Date.now() + 40_000
  for (let index = 0; index < 30 && Date.now() < deadline; index++) {
    const lease = randomUUID()
    const { rows: [row] } = await db.query<OutboxRow>(
      `UPDATE oweg_order_email_outbox SET lease_token = $1, attempts = attempts + 1,
       first_attempt_at = COALESCE(first_attempt_at, now()), available_at = now() + interval '2 minutes',
       updated_at = now() WHERE id = (
         SELECT id FROM oweg_order_email_outbox WHERE status = 'pending' AND available_at <= now()
         ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
       ) RETURNING id, order_id, event_type, attempts, first_attempt_at, request_hash`,
      [lease]
    )
    if (!row) break

    let status = "failed"
    let reason: string | null = "retry_window_elapsed"
    let providerId: string | null = null
    let delay = 0
    if (row.attempts <= MAX_ATTEMPTS && Date.now() - new Date(row.first_attempt_at).getTime() < RETRY_WINDOW_MS) {
      const { rows: [order] } = await db.query<{ email: string | null; display_id: number | null; cancellation_reason: string | null }>(
        `SELECT email, display_id,
           CASE WHEN $2 = 'order_cancelled' AND metadata->>'cancellation_source' = 'admin'
             THEN metadata->>'customer_cancel_reason' END AS cancellation_reason FROM "order"
         WHERE id = $1 AND deleted_at IS NULL AND is_draft_order IS FALSE
           AND no_notification IS NOT TRUE
           AND COALESCE(metadata->>'checkout_duplicate_suppressed', '') <> 'true'
           AND (($2 = 'order_cancelled') = (status::text IN ('canceled', 'cancelled')))`,
        [row.order_id, row.event_type]
      )
      const email = order?.email?.trim()
      if (!order || !email || !/^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(email)) {
        status = "skipped"
        reason = order ? "recipient_unavailable" : "order_ineligible"
      } else {
        const content = renderOrderEmail({
          event: row.event_type, orderId: row.order_id, displayId: order.display_id,
          origin, cancellationReason: order.cancellation_reason,
        })
        const body = JSON.stringify({ from, to: [email], ...content })
        const hash = createHash("sha256").update(body).digest("hex")
        reason = "request_changed_after_attempt"
        if (!row.request_hash || row.request_hash === hash) {
          const fenced = await db.query(
            `UPDATE oweg_order_email_outbox SET request_hash = $3
             WHERE id = $1 AND lease_token = $2 AND available_at > now()`,
            [row.id, lease, hash]
          )
          if (fenced.rowCount !== 1) continue
          try {
            providerId = await sendEmail(body, row.id, key, request)
            status = "accepted"
            reason = null
          } catch (error) {
            if (!(error instanceof SendError)) throw error
            reason = error.code
            delay = Math.max(Math.min(3600, 30 * 2 ** row.attempts), error.delaySeconds)
            if (error.retryable && row.attempts < MAX_ATTEMPTS &&
                Date.now() - new Date(row.first_attempt_at).getTime() + delay * 1000 < RETRY_WINDOW_MS) {
              status = "pending"
            }
          }
        }
      }
    }

    await db.query(
      `UPDATE oweg_order_email_outbox SET status = $3, last_error = $4, provider_id = $5,
       available_at = now() + ($6 * interval '1 second'), lease_token = NULL, updated_at = now()
       WHERE id = $1 AND lease_token = $2`,
      [row.id, lease, status, reason, providerId, status === "pending" ? delay : 0]
    )
    if (status === "failed") logger.warn(`[order-email] failed id=${row.id} event=${row.event_type} reason=${reason}`)
    if (reason === "provider_http_429") break
  }
}

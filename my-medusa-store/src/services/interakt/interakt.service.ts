import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
export type NotificationEvent = "order_placed" | "order_shipped" | "order_delivered" | "order_cancelled"
export class InteraktError extends Error {
  constructor(public code: string, public retryable = false, public uncertain = false) { super(code) }
}
export function indianPhone(value: unknown): string {
  const raw = String(value || "").trim()
  if (!raw) throw new InteraktError("missing_phone")
  if (!/^\+?[\d\s()-]+$/.test(raw)) throw new InteraktError("invalid_phone")
  let digits = raw.replace(/\D/g, "")
  if (digits.startsWith("0091") && digits.length === 14) digits = digits.slice(4)
  else if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2)
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1)
  if (!/^[6-9]\d{9}$/.test(digits)) throw new InteraktError("invalid_phone")
  return digits
}
function encryptionKey(): Buffer {
  const value = process.env.INTERAKT_LOG_ENCRYPTION_KEY || ""
  if (!/^[a-f\d]{64}$/i.test(value)) throw new InteraktError("invalid_encryption_key")
  return Buffer.from(value, "hex")
}
export function encryptPayload(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64")
}
export function decryptPayload(value: string): any {
  const data = Buffer.from(value, "base64")
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), data.subarray(0, 12))
  cipher.setAuthTag(data.subarray(12, 28))
  return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8"))
}
/** Official ITL forward movement states map to the business shipped event. */
export function itlNotificationEvent(raw: unknown): NotificationEvent | null {
  const status = String(raw || "").trim().toLowerCase().replace(/[_\s]+/g, " ")
  return ["shipped", "picked up", "in transit"].includes(status) ? "order_shipped" : status === "delivered" ? "order_delivered" : null
}
export function templateFor(event: NotificationEvent): string {
  const config = {
    order_placed: ["INTERAKT_ORDER_CONFIRMATION_TEMPLATE", "order_confirmation_utility"],
    order_shipped: ["INTERAKT_ORDER_SHIPPED_TEMPLATE", "order_shipped_utility"],
    order_delivered: ["INTERAKT_ORDER_DELIVERED_TEMPLATE", "order_delivered_utility"],
    order_cancelled: ["INTERAKT_ORDER_CANCELLATION_TEMPLATE", "order_cancellation_utility"],
  }[event]
  return process.env[config[0]]?.trim() || config[1]
}
/** Cancellation request metadata is not proof of a successfully cancelled order. */
export function isOrderSuccessfullyCancelled(order: { status?: unknown; is_draft_order?: boolean } | null | undefined): boolean {
  return order?.is_draft_order !== true && ["canceled", "cancelled"].includes(String(order?.status || "").toLowerCase())
}
export function notificationPayload(order: any, customer: any, event: NotificationEvent, trackingUrl?: string | null) {
  if (event === "order_cancelled" && !isOrderSuccessfullyCancelled(order)) throw new InteraktError("order_not_cancelled")
  // Transactional order updates apply to every customer with a valid registered phone.
  const phone = indianPhone(customer?.phone)
  if (order.display_id == null) throw new InteraktError("missing_display_id")
  const bodyValues = [String(customer.first_name || order.shipping_address?.first_name || "Customer"), String(order.display_id)]
  if (event === "order_shipped") {
    let url: URL
    try { url = new URL(trackingUrl || "") } catch { throw new InteraktError("missing_tracking_url") }
    if (url.protocol !== "https:" || url.username || url.password) throw new InteraktError("invalid_tracking_url")
    bodyValues.push(url.href)
  }
  return { phone, bodyValues }
}
export async function sendInteraktTemplate(phone: string, template: string, bodyValues: string[], callbackData: string, request: typeof fetch = fetch): Promise<string> {
  const key = process.env.INTERAKT_API_KEY?.trim()
  if (!key) throw new InteraktError("missing_api_key")
  const url = process.env.INTERAKT_API_URL || "https://api.interakt.ai/v1/public/message/"
  if (url !== "https://api.interakt.ai/v1/public/message/") throw new InteraktError("invalid_api_url")
  const normalizedPhone = indianPhone(phone)
  let response: Response
  try {
    response = await request(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Basic ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode: "+91", phoneNumber: normalizedPhone, type: "Template", callbackData,
        template: { name: template, languageCode: "en", bodyValues } }),
    })
  } catch { throw new InteraktError("transport_outcome_unknown", false, true) }
  // 429 explicitly rejects the request; other server failures may follow acceptance.
  if (response.status === 429) throw new InteraktError("http_429", true)
  if (!response.ok) throw new InteraktError(`http_${response.status}`, false, response.status >= 500 || response.status === 408)
  let body: any
  try { body = await response.json() } catch { throw new InteraktError("acceptance_outcome_unknown", false, true) }
  if (body?.result === false || typeof body?.id !== "string" || !body.id) throw new InteraktError("acceptance_outcome_unknown", false, true)
  return body.id
}

import { test } from "node:test"
import assert from "node:assert/strict"
import { indianPhone, notificationPayload, itlNotificationEvent, sendInteraktTemplate, encryptPayload, decryptPayload } from "../../services/interakt/interakt.service"
import { enqueueNotification, processNotificationOutbox } from "../../services/interakt/outbox"
import whatsappOrderPlaced from "../../subscribers/whatsapp-order-placed"
process.env.INTERAKT_ENABLED = "true"
process.env.INTERAKT_API_KEY = "test-api-secret"
process.env.INTERAKT_LOG_ENCRYPTION_KEY = "ab".repeat(32)
const order: any = { id: "order_fixture", customer_id: "customer_fixture", display_id: 10582, metadata: {} }
const customer: any = { first_name: "Fixture", phone: "+91 98765 43210", metadata: {} }
const container = { resolve: (name: string) => name === "order" ? { retrieveOrder: async () => order } : { retrieveCustomer: async () => customer } }
const silent = { info: (_: string) => {}, warn: (_: string) => {} }
const accepted = async () => new Response('{"result":true,"id":"message_fixture"}', { status: 201 })
// In-memory SQL boundary: checks the production conflict/locking statements; no live DB is contacted.
class MemoryDb {
  rows: any[] = []
  async query(sql: string, p: any[] = []) {
    if (sql.includes("INSERT INTO")) {
      assert.match(sql, /ON CONFLICT \(order_id,event_type\) DO NOTHING/)
      if (!this.rows.some(r => r.order_id === p[1] && r.event_type === p[3])) {
        const [id, order_id, customer_id, event_type, recipient_phone, payload_encrypted, template_name, status, error_details] = p
        this.rows.push({ id, order_id, customer_id, event_type, recipient_phone, payload_encrypted, template_name, status, error_details, attempts: 0 })
      }
    } else if (sql.includes("RETURNING *")) {
      assert.match(sql, /FOR UPDATE SKIP LOCKED/)
      const row = this.rows.find(r => r.status === "PENDING" && !r.processing_at && !r.blocked && r.attempts < 5)
      if (row) { row.processing_at = new Date(); row.attempts++; return { rows: [{ ...row }] } }
    } else if (sql.includes("worker_outcome_unknown")) {
      for (const r of this.rows.filter(r => r.status === "PENDING" && r.stale)) Object.assign(r, { status: "FAILED", error_details: "worker_outcome_unknown" })
    } else if (sql.includes("status='SENT'")) Object.assign(this.rows.find(r => r.id === p[0]), { status: "SENT", interakt_message_id: p[1], delivery_status: "ACCEPTED", processing_at: null })
    else if (sql.includes("status=$2")) {
      Object.assign(this.rows.find(r => r.id === p[0]), { status: p[1], error_details: p[2], processing_at: null, blocked: true })
      assert.ok(p[3] >= 120)
    } else throw new Error("Unexpected SQL")
    return { rows: [] }
  }
}
test("Indian formatting; missing, invalid and foreign phones", () => {
  for (const p of ["9876543210", "+91 98765 43210", "919876543210", "00919876543210", "09876543210"]) assert.equal(indianPhone(p), "9876543210")
  assert.throws(() => indianPhone(null), /missing_phone/)
  for (const p of ["123", "test9876543210", "+1 9876543210", "5123456789"]) assert.throws(() => indianPhone(p), /invalid_phone/)
})
for (const event of ["order_placed", "order_shipped", "order_delivered"] as const) {
  test(`${event}: consent metadata never gates transactional order updates`, () => {
    for (const flag of [undefined, false, true]) {
      const metadata = flag === undefined ? {} : { whatsapp_order_notifications_consent: flag }
      const payload = notificationPayload({ ...order, metadata }, { ...customer, metadata }, event, "https://tracking.example/awb")
      assert.equal(payload.phone, "9876543210")
      assert.equal(payload.bodyValues[1], "10582")
    }
  })
}
test("registered phone, public display ID and HTTPS tracking validation", () => {
  assert.deepEqual(notificationPayload(order, customer, "order_placed").bodyValues, ["Fixture", "10582"])
  assert.throws(() => notificationPayload(order, { ...customer, phone: null }, "order_placed"), /missing_phone/)
  assert.throws(() => notificationPayload(order, customer, "order_shipped"), /missing_tracking_url/)
  assert.throws(() => notificationPayload(order, customer, "order_shipped", "http://tracking.example/a"), /invalid_tracking_url/)
})
test("exact ITL statuses; no booking, RTO, undelivered or unsupported status", () => {
  for (const status of ["Shipped", "Picked Up", "In Transit", "in_transit"]) assert.equal(itlNotificationEvent(status), "order_shipped"); assert.equal(itlNotificationEvent("Delivered"), "order_delivered")
  for (const s of ["not_shipped", "unshipped", "undelivered", "rto_delivered", "out_for_delivery", "created", "unknown", "", 7]) assert.equal(itlNotificationEvent(s), null)
})
test("encrypted data roundtrip and tamper protection", () => {
  const p = notificationPayload(order, customer, "order_placed"), encrypted = encryptPayload(p)
  assert.ok(!encrypted.includes(customer.first_name)); assert.deepEqual(decryptPayload(encrypted), p)
  const data = Buffer.from(encrypted, "base64"); data[30] ^= 1; assert.throws(() => decryptPayload(data.toString("base64")))
})
for (const event of ["order_placed", "order_shipped", "order_delivered"] as const) test(`${event}: success and duplicate suppression`, async () => {
  const db = new MemoryDb(), calls: any[] = [], url = event === "order_shipped" ? "https://tracking.example/awb" : undefined
  await Promise.all([enqueueNotification(container, order.id, event, url, db), enqueueNotification(container, order.id, event, url, db)])
  assert.equal(db.rows.length, 1); assert.equal(db.rows[0].recipient_phone, "******3210")
  await processNotificationOutbox(db, (async (_: any, init: any) => { calls.push(init); return accepted() }) as any, silent)
  await processNotificationOutbox(db, accepted as any, silent)
  assert.equal(calls.length, 1)
  const body = JSON.parse(calls[0].body)
  assert.equal(body.countryCode, "+91"); assert.equal(body.phoneNumber, "9876543210"); assert.equal(calls[0].headers.Authorization, "Basic test-api-secret")
  assert.equal(body.template.name, { order_placed: "order_confirmation_utility", order_shipped: "order_shipped_utility", order_delivered: "order_delivered_utility" }[event])
  assert.deepEqual(body.template.bodyValues, ["Fixture", "10582", ...(url ? [url] : [])])
  assert.equal(db.rows[0].status, "SENT"); assert.equal(db.rows[0].interakt_message_id, "message_fixture"); assert.equal(db.rows[0].delivery_status, "ACCEPTED")
})
test("missing tracking durably fails without HTTP", async () => {
  const db = new MemoryDb(); await enqueueNotification(container, order.id, "order_shipped", null, db)
  await processNotificationOutbox(db, (() => { throw new Error("must not send") }) as any, silent)
  assert.equal(db.rows[0].status, "FAILED"); assert.equal(db.rows[0].error_details, "missing_tracking_url")
})
test("429 backoff then one successful retry; maximum attempts enforced", async () => {
  const db = new MemoryDb(); await enqueueNotification(container, order.id, "order_placed", null, db)
  const limited = (async () => new Response("private data", { status: 429 })) as any
  await processNotificationOutbox(db, limited, silent); assert.equal(db.rows[0].status, "PENDING")
  db.rows[0].blocked = false; await processNotificationOutbox(db, accepted as any, silent)
  assert.equal(db.rows[0].status, "SENT"); assert.equal(db.rows[0].attempts, 2)
  const capped = new MemoryDb(); await enqueueNotification(container, order.id, "order_placed", null, capped)
  capped.rows[0].attempts = 4; await processNotificationOutbox(capped, limited, silent); assert.equal(capped.rows[0].status, "FAILED")
})
for (const mode of ["timeout", "500", "401", "missing_id"]) test(`${mode}: tracked, sanitized and never blindly resent`, async () => {
  const db = new MemoryDb(); await enqueueNotification(container, order.id, "order_placed", null, db)
  const logs: string[] = []; let count = 0
  const request = async () => { count++; if (mode === "timeout") throw new Error("private data"); return new Response(mode === "missing_id" ? '{}' : "private data", { status: mode === "missing_id" ? 201 : Number(mode) }) }
  await processNotificationOutbox(db, request as any, { info: s => logs.push(s), warn: s => logs.push(s) }); await processNotificationOutbox(db, request as any, silent)
  assert.equal(db.rows[0].status, "FAILED"); assert.equal(count, 1); assert.ok(!logs.join().includes("private data") && !logs.join().includes("test-api-secret"))
})
test("stale claims are quarantined", async () => {
  const db = new MemoryDb(); await enqueueNotification(container, order.id, "order_placed", null, db)
  Object.assign(db.rows[0], { stale: true, processing_at: new Date(0) })
  await processNotificationOutbox(db, accepted as any, silent); assert.equal(db.rows[0].error_details, "worker_outcome_unknown")
})
test("DB acknowledgement failure leaves the claim for reconciliation", async () => {
  const db = new MemoryDb(); await enqueueNotification(container, order.id, "order_placed", null, db)
  const original = db.query.bind(db); db.query = async (sql, p) => { if (sql.includes("status='SENT'")) throw new Error("db unavailable"); return original(sql, p) }
  await assert.rejects(processNotificationOutbox(db, accepted as any, silent), /db unavailable/); assert.ok(db.rows[0].processing_at)
})
test("queued messages send without consent metadata", async () => {
  const db = new MemoryDb(); await enqueueNotification(container, order.id, "order_placed", null, db)
  const noConsentMetadata = { resolve: (n: string) => n === "order" ? { retrieveOrder: async () => order } : { retrieveCustomer: async () => ({ ...customer, metadata: {} }) } }
  await processNotificationOutbox(db, accepted as any, silent, noConsentMetadata); assert.equal(db.rows[0].status, "SENT")
})
test("disabled subscriber does not resolve services", async () => {
  process.env.INTERAKT_ENABLED = "false"
  try { await whatsappOrderPlaced({ event: { data: { id: order.id } }, container: { resolve: () => { throw new Error("must not resolve") } } } as any) } finally { process.env.INTERAKT_ENABLED = "true" }
})
test("custom endpoints cannot receive API credentials", async () => {
  process.env.INTERAKT_API_URL = "https://other.example/"
  try { await assert.rejects(sendInteraktTemplate(customer.phone, "test", [], "callback", accepted as any), /invalid_api_url/) } finally { delete process.env.INTERAKT_API_URL }
})
test("MSG91 OTP send/verify keep their endpoint and auth", async () => {
  const { sendMsg91Otp, verifyMsg91Otp } = require("../login-otp/msg91")
  const previous = global.fetch, calls: any[] = []
  global.fetch = (async (url: any, init: any) => { calls.push({ url: String(url), init }); return new Response('{"type":"success","message":"verified"}') }) as any
  try {
    await sendMsg91Otp("919876543210"); assert.equal(await verifyMsg91Otp("919876543210", "123456"), true)
    assert.ok(calls[0].url.startsWith("https://control.msg91.com/api/v5/otp?")); assert.ok(calls[1].url.startsWith("https://control.msg91.com/api/v5/otp/verify?"))
    assert.ok("authkey" in calls[0].init.headers); assert.ok(!("Authorization" in calls[0].init.headers))
  } finally { global.fetch = previous }
})

test("registered mobile changed after enqueue requires reviewed replay", async () => {
  const db = new MemoryDb(); await enqueueNotification(container, order.id, "order_placed", null, db)
  const changed = { resolve: (n: string) => n === "order" ? { retrieveOrder: async () => order } : { retrieveCustomer: async () => ({ ...customer, phone: "9123456789" }) } }
  await processNotificationOutbox(db, accepted as any, silent, changed); assert.equal(db.rows[0].error_details, "registered_phone_changed")
})

test("transient recipient lookup failure retries before any provider request", async () => {
  const db = new MemoryDb(); await enqueueNotification(container, order.id, "order_placed", null, db)
  const unavailable = { resolve: () => { throw new Error("database unavailable") } }
  await processNotificationOutbox(db, (() => { throw new Error("must not send") }) as any, silent, unavailable)
  assert.equal(db.rows[0].status, "PENDING"); assert.equal(db.rows[0].error_details, "recipient_lookup_failed")
})

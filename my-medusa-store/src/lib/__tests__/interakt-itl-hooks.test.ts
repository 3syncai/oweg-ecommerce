import { test } from "node:test"
import assert from "node:assert/strict"


import { getEasyShipProvider, resetEasyShipProviderCache } from "../../services/easy-ship"
const outboxPath = require.resolve("../../services/interakt/outbox")
const originalOutbox = require(outboxPath)
const outbox = { ...originalOutbox }
require.cache[outboxPath]!.exports = outbox
const { handleItlWebhook } = require("../../api/custom/itl/webhook/handler")
const { syncVendorShipmentTracking } = require("../vendor-shipment-tracking-sync")
process.env.ITL_MODE = "live"
process.env.ITL_WEBHOOK_SECRET = "fixture-webhook-secret"
process.env.EASY_SHIP_PROVIDER = "itl"
process.env.INTERAKT_ENABLED = "true"
process.env.INTERAKT_LOG_ENCRYPTION_KEY = "ab".repeat(32)
function fixture() {
  const order: any = { id: "order_hook", display_id: 42, customer_id: "cus_hook", fulfillments: [], metadata: {
    payment_method: "cod", vendor_order_workflows: { vendor_a: { shipping_method: "easy", shipping_provider: "itl", shiprocket_awb: "awb_fixture", tracking_url: "https://tracking.example/awb_fixture", shiprocket_status: "created", stage: "to_dispatch" } },
  } }
  const customer = { first_name: "Fixture", phone: "9876543210", metadata: {} }
  const service = { listOrders: async () => [order], retrieveOrder: async () => order, updateOrders: async (_id: any, patch: any) => { order.metadata = patch.metadata } }
  const scope = { resolve: (key: string) => key === "order" ? service : { retrieveCustomer: async () => customer } }
  const entries = new Map<string, any[]>()
  const db = { query: async (_sql: string, params: any[]) => { const key = `${params[1]}:${params[3]}`; if (!entries.has(key)) entries.set(key, params); return { rows: [] } } }
  return { order, scope, entries, db }
}
function response() {
  return { code: 200, body: null as any, status(code: number) { this.code = code; return this }, json(body: any) { this.body = body; return this } }
}
test("authenticated ITL shipped/delivered webhooks deduplicate via existing order identity", async () => {
  const f = fixture(), original = outbox.enqueueNotification
  outbox.enqueueNotification = (c: any, id: string, e: any, url: string) => original(c, id, e, url, f.db)
  try {
    for (const status of ["Picked Up", "In Transit", "Shipped", "Delivered", "Delivered"]) {
      const res = response()
      await handleItlWebhook({ headers: { "x-itl-webhook-secret": "fixture-webhook-secret" }, scope: f.scope, body: { awb: "awb_fixture", current_status: status } } as any, res as any)
      assert.equal(res.code, 200)
    }
    assert.equal(f.entries.size, 2); assert.ok(f.entries.has("order_hook:order_shipped")); assert.ok(f.entries.has("order_hook:order_delivered"))
  } finally { outbox.enqueueNotification = original }
})
test("unauthenticated/unknown shipment webhooks never enqueue", async () => {
  const f = fixture(), original = outbox.enqueueNotification
  outbox.enqueueNotification = () => { throw new Error("must not enqueue") }
  try {
    const denied = response(); await handleItlWebhook({ headers: {}, body: {}, scope: f.scope } as any, denied as any); assert.equal(denied.code, 401)
    const unknown = response(); await handleItlWebhook({ headers: { "x-itl-webhook-secret": "fixture-webhook-secret" }, body: { awb: "unknown", status: "Shipped" }, scope: f.scope } as any, unknown as any); assert.equal(unknown.body.matched, false)
  } finally { outbox.enqueueNotification = original }
})
test("unsupported status never queues; enqueue failure requests webhook retry", async () => {
  const f = fixture(), original = outbox.enqueueNotification; let calls = 0
  outbox.enqueueNotification = () => { calls++; throw new Error("db unavailable") }
  try {
    for (const [status, expected] of [["mystery", 200], ["Shipped", 503]] as const) {
      const res = response(); await handleItlWebhook({ headers: { "x-api-key": "fixture-webhook-secret" }, scope: f.scope, body: { awb: "awb_fixture", current_status: status } } as any, res as any); assert.equal(res.code, expected)
    }
    assert.equal(calls, 1)
  } finally { outbox.enqueueNotification = original }
})
test("existing ITL polling queues raw carrier status and repairs delivered enqueue on replay", async () => {
  resetEasyShipProviderCache()
  const provider = getEasyShipProvider(), originalTrack = provider.trackByAwb, originalEnqueue = outbox.enqueueNotification
  const f = fixture()
  outbox.enqueueNotification = (c: any, id: string, e: any, url: string) => originalEnqueue(c, id, e, url, f.db)
  try {
    for (const status of ["Shipped", "Delivered", "Delivered"]) {
      provider.trackByAwb = async () => ({ current_status: status, status })
      await syncVendorShipmentTracking({ container: f.scope as any, order: f.order, vendorId: "vendor_a", vendorProductIds: [], ensureShippedOnMovement: false })
    }
    assert.equal(f.entries.size, 2)
    provider.trackByAwb = async () => { throw new Error("carrier unavailable") }
    await syncVendorShipmentTracking({ container: f.scope as any, order: f.order, vendorId: "vendor_a", vendorProductIds: [], ensureShippedOnMovement: false })
    assert.equal(f.entries.size, 2)
  } finally { provider.trackByAwb = originalTrack; outbox.enqueueNotification = originalEnqueue; resetEasyShipProviderCache() }
})

test("order.placed subscriber enqueues confirmation once and makes no provider request", async () => {
  const f = fixture(), original = outbox.enqueueNotification
  outbox.enqueueNotification = (c: any, id: string, e: any) => original(c, id, e, undefined, f.db)
  const { default: subscriber, config } = require("../../subscribers/whatsapp-order-placed")
  try {
    assert.equal(config.event, "order.placed")
    await subscriber({ event: { data: { id: f.order.id } }, container: f.scope })
    await subscriber({ event: { data: { id: f.order.id } }, container: f.scope })
    assert.equal(f.entries.size, 1); assert.ok(f.entries.has("order_hook:order_placed"))
  } finally { outbox.enqueueNotification = original }
})

test("late carrier shipped event after delivery never sends a new shipped message", async () => {
  const f = fixture(), original = outbox.enqueueNotification
  f.order.metadata.vendor_order_workflows.vendor_a.stage = "delivered"
  f.order.metadata.vendor_order_workflows.vendor_a.shiprocket_status = "delivered"
  let calls = 0
  outbox.enqueueNotification = () => { calls++ }
  try {
    const res = response()
    await handleItlWebhook({ headers: { "x-api-key": "fixture-webhook-secret" }, scope: f.scope, body: { awb: "awb_fixture", current_status: "Shipped" } } as any, res as any)
    assert.equal(calls, 0)
  } finally { outbox.enqueueNotification = original }
})

test("order.canceled subscriber queues only the completed cancellation, and repeated events deduplicate", async () => {
  const f = fixture(), original = outbox.enqueueNotification
  outbox.enqueueNotification = (c: any, id: string, e: any) => original(c, id, e, undefined, f.db)
  const { default: subscriber, config } = require("../../subscribers/whatsapp-order-canceled")
  const originalFetch = global.fetch
  let httpCalls = 0
  global.fetch = (async () => { httpCalls++; throw new Error("no inline provider request") }) as any
  try {
    assert.equal(config.event, "order.canceled")
    f.order.status = "pending"
    f.order.metadata.cancellation_requested_at = new Date().toISOString()
    await subscriber({ event: { data: { id: f.order.id } }, container: f.scope })
    assert.equal(f.entries.size, 0)
    f.order.status = "canceled"
    f.order.is_draft_order = false
    await subscriber({ event: { data: { id: f.order.id } }, container: f.scope })
    await subscriber({ event: { data: { id: f.order.id } }, container: f.scope })
    assert.equal(f.entries.size, 1)
    const entry = f.entries.get("order_hook:order_cancelled")!
    assert.equal(entry[6], "order_cancellation_utility")
    assert.equal(entry[7], "PENDING")
    assert.equal(httpCalls, 0)
    assert.equal(f.order.status, "canceled")
  } finally { global.fetch = originalFetch; outbox.enqueueNotification = original }
})
test("an asynchronous cancellation enqueue failure cannot revert the cancelled order", async () => {
  const f = fixture(), original = outbox.enqueueNotification
  f.order.status = "canceled"
  outbox.enqueueNotification = async () => { throw new Error("notification database unavailable") }
  const { default: subscriber } = require("../../subscribers/whatsapp-order-canceled")
  try {
    await assert.rejects(subscriber({ event: { data: { id: f.order.id } }, container: f.scope }), /notification database unavailable/)
    assert.equal(f.order.status, "canceled")
  } finally { outbox.enqueueNotification = original }
})
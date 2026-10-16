import { test } from "node:test"
import assert from "node:assert/strict"
import { orderListOverview } from "../../admin-order-list"

const products = new Map([
  ["p1", { metadata: { vendor_id: "v1" } }],
  ["p2", { metadata: { vendor_id: "v2" } }],
])
const vendors = new Map([
  ["v1", { store_name: "Store One" }],
  ["v2", { store_name: "Store Two" }],
])
const base = () => ({
  id: "order_example", status: "pending", metadata: {},
  items: [{ id: "i1", product_id: "p1", quantity: 3 }], fulfillments: [],
})

test("unaccepted COD order resolves store before vendor acceptance and sums units", () => {
  const order = base()
  order.metadata = { payment_method: "cod" }
  const result = orderListOverview(order, products, vendors)
  assert.equal(result.payment, "COD")
  assert.equal(result.quantity, 3)
  assert.deepEqual(result.stores, [{ name: "Store One", status: "To Accept" }])
})

test("vendor stages retain their distinct client-facing labels", () => {
  for (const [stage, label] of Object.entries({
    to_pack: "To Pack", to_dispatch: "To Dispatch", in_transit: "In-Transit", delivered: "Delivered",
  })) {
    const order = base()
    order.metadata = { vendor_order_workflows: { v1: { stage } } }
    assert.equal(orderListOverview(order, products, vendors).status, label)
  }
})

test("one delivered store cannot make a split order's pending store delivered", () => {
  const order: any = base()
  order.items.push({ id: "i2", product_id: "p2", quantity: 2 })
  order.metadata = { vendor_order_workflows: {
    v1: { stage: "delivered", medusa_fulfillment_id: "f1" }, v2: { stage: "to_pack" },
  } }
  order.fulfillments = [{ id: "f1", delivered_at: "2026-10-16" }]
  const result = orderListOverview(order, products, vendors)
  assert.equal(result.quantity, 5)
  assert.deepEqual(result.stores.map((s) => s.status), ["Delivered", "To Pack"])
})

test("received quantities distinguish partial/full returns without double counting native records", () => {
  const order: any = base()
  order.items[0].detail = { return_received_quantity: 1 }
  assert.equal(orderListOverview(order, products, vendors, new Map([["i1", 1]])).status, "Partially Returned")
  assert.equal(orderListOverview(order, products, vendors, new Map([["i1", 3]])).status, "Returned")
  order.status = "canceled"
  assert.equal(orderListOverview(order, products, vendors, new Map([["i1", 3]])).status, "Cancelled")
})

test("unknown store information is not fabricated", () => {
  assert.deepEqual(orderListOverview(base(), new Map(), new Map()).stores, [])
})

test("graph item detail quantities and missing quantities do not become zero", () => {
  const order: any = base()
  order.items = [{ id: "i1", product_id: "p1", detail: { quantity: 3 } }]
  assert.equal(orderListOverview(order, products, vendors).quantity, 3)
  order.items = [{ id: "i1", product_id: "p1" }]
  assert.equal(orderListOverview(order, products, vendors).quantity, null)
})

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  customerOrderSummary,
  summaryPagination,
  CUSTOMER_ORDER_SUMMARY_FIELDS,
} from "../customer-order-summary"

test("customer order summary excludes nested order data and private fields", () => {
  const summary = customerOrderSummary({
    id: "order_1",
    display_id: 1,
    total: 99,
    items: [{ title: "Private item" }],
    shipping_address: { address_1: "Private" },
    metadata: { secret: true },
    payment_collections: [{}],
    customer: {},
    email: "private@example.com",
  })
  assert.deepEqual(Object.keys(summary), [...CUSTOMER_ORDER_SUMMARY_FIELDS])
  assert.equal(summary.total, 99)
  assert.equal(summary.status, null)
})

test("summary pagination cannot override customer scope or expand fields", () => {
  assert.deepEqual(summaryPagination({}), { skip: 0, take: 10 })
  assert.deepEqual(summaryPagination({ offset: "20", limit: "10" }), {
    skip: 20,
    take: 10,
  })
  for (const query of [
    { fields: "*items" },
    { customer_id: "other" },
    { limit: "0" },
    { limit: "51" },
    { offset: "-1" },
    { offset: ["0", "1"] },
    { limit: "1e2" },
    { limit: "1.5" },
  ])
    assert.throws(() => summaryPagination(query))
})

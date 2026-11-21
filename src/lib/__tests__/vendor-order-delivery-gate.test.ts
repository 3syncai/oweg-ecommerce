import assert from "node:assert/strict"
import { test } from "node:test"
import { canAwardOrderLevelRewards } from "../vendor-order-delivery-gate"

test("allows single-vendor and legacy metadata", () => {
  assert.equal(canAwardOrderLevelRewards(null).allowed, true)
  assert.equal(canAwardOrderLevelRewards({}).allowed, true)
  assert.equal(
    canAwardOrderLevelRewards({
      vendor_order_workflows: {
        vend_only: { stage: "in_transit" },
      },
    }).allowed,
    true
  )
})

test("blocks coins when a sibling vendor is still shipping", () => {
  const gate = canAwardOrderLevelRewards({
    vendor_order_workflows: {
      vend_a: { stage: "delivered", shiprocket_delivered_at: "2026-11-03T00:00:00.000Z" },
      vend_b: { stage: "in_transit" },
    },
  })
  assert.equal(gate.allowed, false)
  assert.equal(gate.reason, "waiting_for_sibling_vendors")
  assert.deepEqual(gate.pending_vendor_ids, ["vend_b"])
})

test("allows coins only after every vendor workflow is delivered", () => {
  const gate = canAwardOrderLevelRewards({
    vendor_order_workflows: {
      vend_a: { stage: "delivered" },
      vend_b: { stage: "delivered", self_delivered_at: "2026-11-04T00:00:00.000Z" },
    },
  })
  assert.equal(gate.allowed, true)
})

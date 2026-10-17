import { test } from "node:test"
import assert from "node:assert/strict"
import { latestReassignment, matchesReassignedReturnItem } from "../vendor-reassignment-history"

test("a returned replacement item resolves to the immutable paid item across two vendor reassignments", () => {
  const metadata = { vendor_reassignment_history: [
    { original_item_id: "original", from_item_id: "original", current_item_id: "second", current_order_item_id: "oi_second", from_vendor_id: "a", to_vendor_id: "b" },
    { original_item_id: "original", from_item_id: "second", current_item_id: "third", current_order_item_id: "oi_third", from_vendor_id: "b", to_vendor_id: "c" },
  ] }
  const frozen = { id: "original", order_item_id: "oi_original" }
  assert.equal(latestReassignment(metadata, "original")?.to_vendor_id, "c")
  assert.equal(matchesReassignedReturnItem(frozen, "third", metadata), true)
  assert.equal(matchesReassignedReturnItem(frozen, "oi_third", metadata), true)
  assert.equal(matchesReassignedReturnItem(frozen, "oi_original", metadata), true)
  assert.equal(matchesReassignedReturnItem(frozen, "second", metadata), false)
})

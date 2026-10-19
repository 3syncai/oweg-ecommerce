import { test } from "node:test"
import assert from "node:assert/strict"
import { reassignmentExcludedVendorIds } from "../vendor-reassignment-exclusions"

test("admin can select an earlier seller while automatic reassignment avoids it", () => {
  const history = [
    { original_item_id: "item-1", from_vendor_id: "mystore-23" },
    { original_item_id: "other-item", from_vendor_id: "unrelated" },
  ]
  assert.deepEqual(reassignmentExcludedVendorIds("TEST", history, "item-1", true), ["TEST"])
  assert.deepEqual(reassignmentExcludedVendorIds("TEST", history, "item-1", false), ["TEST", "mystore-23"])
})

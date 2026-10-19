import { test } from "node:test"
import assert from "node:assert/strict"
import { formatVendorOrderWithCancellations, hasCancelledVendorAssignment } from "../vendor-assignment-cancellations"

test("cancelled vendor assignment keeps its item and admin reason in the vendor view", () => {
  const metadata = { payment_method: "razorpay", razorpay_payment_status: "captured",
    vendor_reassignment_history: [{ from_vendor_id: "vendor_old", action: "admin_cancel_and_relocate" }] }
  assert.equal(hasCancelledVendorAssignment(metadata, "vendor_old"), true)
  assert.equal(hasCancelledVendorAssignment(metadata, "vendor_new"), false)
  const order = { id: "order_1", display_id: 1182, status: "pending", metadata,
    items: [{ id: "current", product_id: "product_new", title: "Product" }] }
  const cancelled = [{ id: "old", product_id: "product_old", title: "Product",
    variant_title: "Default", variant_sku: "SKU-1", quantity: 1, unit_price: 799,
    reason: "not accepted on time", cancelled_at: "2026-10-18T18:07:22.071Z" }]
  const view = formatVendorOrderWithCancellations(order, "vendor_old", ["product_old"], cancelled)
  assert.equal(view.vendor_stage, "cancelled")
  assert.equal(view.cancellation_note, "not accepted on time")
  assert.equal(view.items[0].id, "old")
  assert.equal(view.total, 799)
  assert.equal(view.settlement, null)
})

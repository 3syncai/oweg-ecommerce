import { model } from "@medusajs/framework/utils"

const ReturnRequest = model.define("return_request", {
  id: model.id().primaryKey(),
  order_id: model.text(),
  customer_id: model.text(),
  type: model.text(), // return | replacement
  status: model.text(), // pending_approval, approved, pickup_initiated, picked_up, received, refunded, replaced, rejected, closed
  reason: model.text().nullable(),
  notes: model.text().nullable(),
  payment_type: model.text(), // online | cod
  refund_method: model.text().nullable(), // original | bank
  bank_details_encrypted: model.text().nullable(),
  bank_account_last4: model.text().nullable(),
  approved_at: model.dateTime().nullable(),
  approved_by: model.text().nullable(),
  rejected_at: model.dateTime().nullable(),
  rejected_by: model.text().nullable(),
  rejection_reason: model.text().nullable(),
  pickup_initiated_at: model.dateTime().nullable(),
  picked_up_at: model.dateTime().nullable(),
  received_at: model.dateTime().nullable(),
  refunded_at: model.dateTime().nullable(),
  shiprocket_order_id: model.text().nullable(),
  shiprocket_awb: model.text().nullable(),
  shiprocket_status: model.text().nullable(),
  metadata: model.json().nullable(),
})

export default ReturnRequest

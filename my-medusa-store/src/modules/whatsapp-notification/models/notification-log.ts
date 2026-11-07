import { model } from "@medusajs/framework/utils"

const WhatsappNotificationLog = model.define("whatsapp_notification_log", {
  id: model.id().primaryKey(),
  order_id: model.text(),
  customer_id: model.text().nullable(),
  event_type: model.enum(["order_placed", "order_shipped", "order_delivered"]),
  recipient_phone: model.text().nullable(),
  payload_encrypted: model.text().nullable(),
  template_name: model.text(),
  status: model.enum(["PENDING", "SENT", "FAILED"]).default("PENDING"),
  interakt_message_id: model.text().nullable(),
  delivery_status: model.text().default("UNKNOWN"),
  error_details: model.text().nullable(),
  attempts: model.number().default(0),
  next_attempt_at: model.dateTime(),
  processing_at: model.dateTime().nullable(),
}).indexes([
  // Retain uniqueness even for soft-deleted rows: deletion must not permit a resend.
  { name: "whatsapp_notification_order_event_unique", on: ["order_id", "event_type"], unique: true },
  { name: "whatsapp_notification_pending_idx", on: ["next_attempt_at"], where: "status='PENDING'" },
])
export default WhatsappNotificationLog

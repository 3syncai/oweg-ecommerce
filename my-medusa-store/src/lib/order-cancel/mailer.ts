import { hasPasswordResetMailerConfig } from "../password-reset/config"
import { sendTransactionalEmail } from "../password-reset/mailer"

function orderLabel(displayId?: string | number | null, orderId?: string | null) {
  if (displayId != null && String(displayId).trim()) return `#${displayId}`
  if (orderId) return orderId.slice(0, 10)
  return "your order"
}

export async function sendAdminCancelledCustomerEmail(input: {
  to?: string | null
  displayId?: string | number | null
  orderId?: string | null
  note: string
  orderUrl?: string | null
}) {
  if (!input.to || !hasPasswordResetMailerConfig()) return { sent: false }
  const label = orderLabel(input.displayId, input.orderId)
  const paragraphs = [
    `Reason from OWEG: ${input.note}`,
    "If you paid online, the refund will be processed to your original payment method or the payout details on file.",
  ]
  if (input.orderUrl) {
    paragraphs.push(`View the order: ${input.orderUrl}`)
  }
  await sendTransactionalEmail({
    to: input.to,
    subject: `Your OWEG order ${label} has been cancelled`,
    heading: `Order ${label} is cancelled`,
    intro: "OWEG has cancelled your order. The reason from our team is below.",
    paragraphs,
    previewText: `Order ${label} cancelled. ${input.note}`,
  })
  return { sent: true }
}

export async function sendAdminCancelledVendorEmail(input: {
  to?: string | null
  displayId?: string | number | null
  orderId?: string | null
  note: string
  vendorName?: string | null
}) {
  if (!input.to || !hasPasswordResetMailerConfig()) return { sent: false }
  const label = orderLabel(input.displayId, input.orderId)
  const greeting = input.vendorName ? `Hi ${input.vendorName},` : "Hi,"
  await sendTransactionalEmail({
    to: input.to,
    subject: `OWEG cancelled order ${label}`,
    heading: `Order ${label} was cancelled by admin`,
    intro: `${greeting} this order was cancelled because it was not accepted in time, or OWEG closed it. Do not pack or ship it.`,
    paragraphs: [`Admin note: ${input.note}`, "The customer has been notified of this cancellation."],
    previewText: `Admin cancelled order ${label}. ${input.note}`,
  })
  return { sent: true }
}

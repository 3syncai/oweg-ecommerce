const messages = {
  order_placed: {
    label: "Order confirmed",
    heading: "We’ve received your order",
    description: "Thanks for shopping with OWEG. You can check your order details and follow its progress from your account.",
    action: "View order",
    track: false,
  },
  order_shipped: {
    label: "Shipment update",
    heading: "A package is on its way",
    description: "A package from your order has shipped. Follow its progress in your OWEG account. Items shipped separately may arrive at different times.",
    action: "Track order",
    track: true,
  },
  order_delivered: {
    label: "Delivery update",
    heading: "A package has been delivered",
    description: "A package from your order was marked delivered. Check your OWEG account for the latest status of your items.",
    action: "View delivery status",
    track: true,
  },
  order_cancelled: {
    label: "Order cancelled",
    heading: "Your order was cancelled",
    description: "This confirms the cancellation of your order. Visit your order details for the latest information, including any refund updates when applicable.",
    action: "View order",
    track: false,
  },
} as const

export type OrderEmailEvent = keyof typeof messages

export function storefrontOrigin(value: string | undefined): string {
  const url = new URL(value || "")
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("invalid_storefront_origin")
  }
  return url.origin
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!
  )
}

export function renderOrderEmail(input: {
  event: OrderEmailEvent
  orderId: string
  displayId: number | null
  origin: string
  cancellationReason?: string | null
}) {
  const { event, orderId, displayId } = input
  const origin = storefrontOrigin(input.origin)
  const message = messages[event]
  const reference = displayId == null ? orderId : `#${displayId}`
  const orderUrl = new URL(`/account/orders/${encodeURIComponent(orderId)}${message.track ? "/track" : ""}`, origin)
  if (displayId != null) orderUrl.searchParams.set("orderNo", String(displayId))
  const supportUrl = new URL("/contact", origin)
  const reason = event === "order_cancelled" ? input.cancellationReason?.trim().slice(0, 500) : null
  const subject = `${message.label} · OWEG order ${reference}`
  const text = [
    "OWEG Online Shopping", message.heading, message.description, `Order ${reference}`,
    ...(reason ? [`Reason from OWEG: ${reason}`] : []),
    `${message.action}: ${orderUrl.href}`, `Need help? ${supportUrl.href}`,
  ].join("\n\n")
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f2f5ee;color:#18352d;font-family:Arial,sans-serif">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${message.heading} · Order ${escapeHtml(reference)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f5ee">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dce6da;border-radius:14px">
        <tr><td style="background:#145448;color:#ffffff;padding:21px 24px;border-radius:13px 13px 0 0">
          <span style="font-size:24px;font-weight:bold;color:#ffffff">OWEG</span>
          <span style="margin-left:10px;font-size:13px;color:#e4f0dd">Online Shopping</span>
        </td></tr>
        <tr><td style="padding:27px 24px 24px">
          <p style="margin:0 0 8px;color:#28604a;font-size:13px;font-weight:bold">${message.label}</p>
          <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#18352d">${message.heading}</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#43554e">${message.description}</p>
          <p style="margin:0 0 20px;padding:12px;background:#edf5e8;font-size:14px;overflow-wrap:anywhere">Order <strong>${escapeHtml(reference)}</strong></p>
          ${reason ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#43554e"><strong>Reason from OWEG</strong><br>${escapeHtml(reason)}</p>` : ""}
          <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#145448" style="border-radius:8px">
            <a href="${escapeHtml(orderUrl.href)}" style="display:inline-block;padding:13px 18px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none">${message.action}</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:16px 24px 22px;border-top:1px solid #e4ebe1;color:#43554e;font-size:13px;line-height:1.5">
          Need help with this order? <a href="${escapeHtml(supportUrl.href)}" style="color:#145448;text-decoration:underline">Contact OWEG support</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  return { subject, text, html }
}

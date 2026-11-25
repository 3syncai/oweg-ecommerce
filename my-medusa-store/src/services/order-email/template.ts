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
  const logoUrl = new URL("/oweg_logo.png", origin)
  const reason = event === "order_cancelled" ? input.cancellationReason?.trim().slice(0, 500) : null
  const statusBackground = event === "order_cancelled" ? "#f9eeec" : "#edf4e8"
  const statusColor = event === "order_cancelled" ? "#84372e" : "#24563b"
  const subject = `${message.label} · OWEG order ${reference}`
  const text = [
    "OWEG Online Shopping", message.heading, message.description, `Order ${reference}`,
    ...(reason ? [`Reason from OWEG: ${reason}`] : []),
    `${message.action}: ${orderUrl.href}`, `Need help? ${supportUrl.href}`,
  ].join("\n\n")
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f7f4;color:#17322b;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f5f7f4">
    <tr><td align="center" style="padding:24px 12px">
      <!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="max-width:560px;border:1px solid #dce5dc;border-top:4px solid #145448;text-align:left">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #e6ebe5">
          <a href="${escapeHtml(origin + "/")}" style="display:inline-block;color:#145448;text-decoration:none">
            <img src="${escapeHtml(logoUrl.href)}" width="121" height="32" alt="OWEG Online Shopping" style="display:block;border:0;color:#145448;font-size:13px;font-weight:bold">
          </a>
        </td></tr>
        <tr><td style="padding:26px 24px 24px">
          <h1 style="margin:0 0 10px;font-size:26px;line-height:1.25;color:#17322b">${message.heading}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#43554e">${message.description}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f7f9f6" style="border:1px solid #e4ebe1;border-radius:8px">
            <tr><td style="padding:14px 16px">
              <p style="margin:0 0 5px;color:#526259;font-size:12px;line-height:1.4">Order number</p>
              <p style="margin:0 0 10px;font-size:18px;line-height:1.35;font-weight:bold;overflow-wrap:anywhere">${escapeHtml(reference)}</p>
              <span style="display:inline-block;padding:4px 8px;border-radius:4px;background:${statusBackground};color:${statusColor};font-size:12px;line-height:1.4;font-weight:bold">${message.label}</span>
            </td></tr>
          </table>
          ${reason ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#43554e;overflow-wrap:anywhere"><strong>Cancellation reason</strong><br>${escapeHtml(reason)}</p>` : ""}
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:20px">
            <tr><td bgcolor="#145448" style="border-radius:6px;mso-padding-alt:14px 18px">
              <a href="${escapeHtml(orderUrl.href)}" style="display:inline-block;padding:14px 18px;mso-padding-alt:0;color:#ffffff;font-size:14px;line-height:1.3;font-weight:bold;text-decoration:none">${message.action}</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td bgcolor="#fafbf9" style="padding:16px 24px;border-top:1px solid #e6ebe5;color:#43554e;font-size:13px;line-height:1.5">
          Questions about your order? <a href="${escapeHtml(supportUrl.href)}" style="color:#145448;font-weight:bold;text-decoration:underline">Contact OWEG support</a>.
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body></html>`
  return { subject, text, html }
}

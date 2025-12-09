import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { generateInvoice } from "../services/invoice-generator"

export default async function orderPlacedSubscriber({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const orderModuleService = container.resolve(Modules.ORDER)

  const orderId = data.id

  // 1. Fetch Order Details
  const order = await orderModuleService.retrieveOrder(orderId, {
    relations: ["items", "shipping_address", "billing_address", "currency"],
  })

  // 2. Generate Invoice
  let invoicePdfBuffer: Buffer | null = null
  try {
    invoicePdfBuffer = await generateInvoice(order)
  } catch (err) {
    console.error("Failed to generate invoice PDF:", err)
  }

  if (!order.email) {
    return
  }

  const attachments: any[] = []
  if (invoicePdfBuffer) {
    attachments.push({
      filename: `Invoice-${order.display_id}.pdf`,
      content: invoicePdfBuffer,
    })
  }

  // 3. Send Notification
  await notificationModuleService.createNotifications({
    to: order.email,
    channel: "email",
    template: "order-confirmation",
    data: {
      subject: `Order Confirmation #${order.display_id}`,
      order: order, 
      text: `Thank you for your order! Order ID: ${order.display_id}. Find your invoice attached.`,
      html: `<h1>Thank you for your order!</h1><p>Order ID: ${order.display_id}</p><p>Your invoice is attached.</p>`,
      attachments: attachments
    }
  })
  
  console.log(`Notification sent for order ${orderId}`)
}

export const config: SubscriberConfig = {
  event: "order.placed",
}

import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { Pool } from "pg"
import { generateInvoice } from "../services/invoice-generator"
import { ensureOrderSettlementSnapshots } from "../lib/vendor-settlement-snapshot"

export default async function orderPlacedSubscriber({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const orderModuleService = container.resolve(Modules.ORDER)

  const orderId = data.id

  // 1. Fetch Order Details with basic relations (avoid deep nesting that causes Mikro-ORM strategy errors in Medusa V2)
  const order = await orderModuleService.retrieveOrder(orderId, {
    relations: [
      "items",
      "shipping_address",
      "billing_address"
    ],
  })

  // 1b. Freeze commission / platform / cancel rates on the order at place time
  // so later admin rate changes never rewrite historical or in-progress orders.
  try {
    if (process.env.DATABASE_URL) {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes("rds.amazonaws.com")
          ? { rejectUnauthorized: false }
          : false,
      })
      try {
        await ensureOrderSettlementSnapshots({
          orderId,
          pool,
          orderModule: orderModuleService,
        })
      } finally {
        await pool.end()
      }
    }
  } catch (snapErr) {
    console.error(
      `[order-placed] Failed to snapshot settlement rates for ${orderId}:`,
      snapErr
    )
  }

  // Payment/COD confirmation owns the durable commission outbox.

  // 3. Generate Invoice
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

  // 4. Send Notification
  try {
    await notificationModuleService.createNotifications({
      to: order.email,
      channel: "email",
      template: "order-confirmation",
      data: {
        subject: `Order Confirmation #${order.display_id}`,
        order: order,
        text: `Thank you for your order! Order ID: ${order.display_id}. Find your invoice attached.`,
        html: `<h1>Thank you for your order!</h1><p>Order ID: ${order.display_id}</p><p>Your invoice is attached.</p>`,
        attachments: attachments,
      },
    })
    console.log(`Notification sent for order ${orderId}`)
  } catch (error) {
    console.error("Notification failed for order", orderId, error)
  }
}

console.log("[Commission Hook] 🚀 Subscriber loaded! Listening for Order Placed Events...")

export const config: SubscriberConfig = {
  // Listen for both event types to be safe
  event: ["order.placed", "order.created"],
}
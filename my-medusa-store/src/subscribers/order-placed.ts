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

  // 1. Fetch Order Details with Product Relations
  const order = await orderModuleService.retrieveOrder(orderId, {
    relations: [
      "items",
      "items.variant",
      "items.variant.product", // Fetch product details for category/collection info
      "shipping_address",
      "billing_address"
    ],
  })

  // 2. Send Webhook to Affiliate Portal
  try {
    const customerModuleService = container.resolve(Modules.CUSTOMER)

    // Get customer to extract referral code
    let affiliateCode: string | null = null
    if (order.customer_id) {
      const customer = await customerModuleService.retrieveCustomer(order.customer_id)
      affiliateCode = (customer?.metadata as any)?.referral_code || null
    }

    // If no affiliate code found, skip webhook
    if (!affiliateCode) {
      console.log(`[Webhook] No referral code found for order ${orderId}, skipping commission webhook`)
    } else {
      console.log(`[Webhook] Processing commission for ${order.items?.length || 0} items with affiliate code: ${affiliateCode}`)

      const webhookUrl = process.env.AFFILIATE_WEBHOOK_URL || "http://localhost:3001/api/webhook/commission"

      // Send one webhook per order item
      const webhookPromises = (order.items || []).map(async (item: any) => {
        const product = item.variant?.product

        // Extract category, collection, type from product if not in metadata
        // Note: product.categories might need deeper expansion if required, but collection/type are on product
        const categoryId = (item.variant?.metadata as any)?.category_id || (product?.categories?.[0]?.id) || null;
        const collectionId = (item.variant?.metadata as any)?.collection_id || product?.collection_id || null;
        const productTypeId = (item.variant?.metadata as any)?.product_type_id || product?.type_id || null;

        const payload = {
          order_id: order.id,
          affiliate_code: affiliateCode,
          product_id: item.product_id,
          product_name: item.title,
          category_id: categoryId,
          collection_id: collectionId,
          product_type_id: productTypeId,
          quantity: item.quantity,
          item_price: item.unit_price || 0,
          order_amount: (item.unit_price || 0) * item.quantity,
          status: "PENDING", // Start as PENDING until delivery
          customer_id: order.customer_id,
          customer_name: `${order.shipping_address?.first_name || ''} ${order.shipping_address?.last_name || ''}`.trim() || null,
          customer_email: order.email,
        }

        console.log(`[Webhook] Sending payload for item ${item.product_id}:`, JSON.stringify(payload, null, 2))

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[Webhook] Failed for item ${item.product_id}:`, errorText)
          return { success: false, item: item.product_id, error: errorText }
        } else {
          console.log(`✓ Webhook sent for item ${item.product_id}`)
          return { success: true, item: item.product_id }
        }
      })

      const results = await Promise.all(webhookPromises)
      const successCount = results.filter(r => r.success).length
      console.log(`[Webhook] Commission webhooks completed: ${successCount}/${results.length} successful`)
    }
  } catch (error) {
    console.error(`[Webhook] Commission webhook error for order ${orderId}:`, error)
  }

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
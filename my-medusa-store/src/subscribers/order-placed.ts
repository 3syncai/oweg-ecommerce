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

  // 1. Fetch Order Details with basic relations (avoid deep nesting)
  const order = await orderModuleService.retrieveOrder(orderId, {
    relations: [
      "items",
      "items.variant",
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
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🎯 ORDER PLACED - Commission Webhook Triggered`);
      console.log(`${'='.repeat(80)}`);
      console.log(`📦 Order ID: ${orderId}`);
      console.log(`👤 Customer: ${order.email}`);
      console.log(`🏷️  Affiliate Code: ${affiliateCode}`);
      console.log(`📊 Items Count: ${order.items?.length || 0}`);
      console.log(`${'='.repeat(80)}\n`);

      console.log(`[Webhook] Processing commission for ${order.items?.length || 0} items with affiliate code: ${affiliateCode}`)

      const webhookUrl = process.env.AFFILIATE_WEBHOOK_URL

      if (!webhookUrl) {
        console.error(`\n❌ CRITICAL ERROR: AFFILIATE_WEBHOOK_URL not set!`);
        console.log(`[Webhook] AFFILIATE_WEBHOOK_URL not set, skipping commission webhook for order ${orderId}`)
        return
      }

      console.log(`✅ Webhook URL configured: ${webhookUrl}\n`);

      // Send one webhook per order item
      const webhookPromises = (order.items || []).map(async (item: any) => {
        // Extract category, collection, type from variant metadata
        // Note: Product details should be in variant metadata from order creation
        const categoryId = (item.variant?.metadata as any)?.category_id || item.metadata?.category_id || null;
        const collectionId = (item.variant?.metadata as any)?.collection_id || item.metadata?.collection_id || null;
        const productTypeId = (item.variant?.metadata as any)?.product_type_id || item.metadata?.product_type_id || null;

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

        console.log(`\n📤 Sending webhook for item: ${item.title}`);
        console.log(`   Product ID: ${item.product_id}`);
        console.log(`   Quantity: ${item.quantity}`);
        console.log(`   Amount: ₹${(item.unit_price || 0) / 100}`);
        console.log(`   Status: PENDING`);

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`\n❌ Webhook FAILED for item ${item.product_id}:`)
          console.error(`   Status: ${response.status}`)
          console.error(`   Error: ${errorText}`)
          return { success: false, item: item.product_id, error: errorText }
        } else {
          const result = await response.json();
          console.log(`✅ Webhook SUCCESS for ${item.title}`)
          console.log(`   Response:`, JSON.stringify(result, null, 2))
          return { success: true, item: item.product_id }
        }
      })

      const results = await Promise.all(webhookPromises)
      const successCount = results.filter(r => r.success).length

      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 COMMISSION WEBHOOK SUMMARY`);
      console.log(`${'='.repeat(80)}`);
      console.log(`✅ Successful: ${successCount}/${results.length}`);
      console.log(`❌ Failed: ${results.length - successCount}/${results.length}`);
      console.log(`📝 Status: PENDING (awaiting delivery)`);
      console.log(`${'='.repeat(80)}\n`);
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
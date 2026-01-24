import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Subscriber: order-fulfilled
 * 
 * Triggers when a shipment is created (order shipped/fulfilled).
 * Calls the coin activation webhook to convert PENDING coins to ACTIVE.
 * 
 * This ensures customers get their cashback coins when their order is fulfilled.
 */
export default async function orderFulfilledSubscriber({
    event: { data, name },
    container,
}: SubscriberArgs<Record<string, unknown>>) {
    console.log(`[Coin Activation] 🔔 Event received: ${name}`)
    console.log(`[Coin Activation] Event data:`, JSON.stringify(data, null, 2))

    // The shipment.created event passes the fulfillment ID as data.id
    const fulfillmentId = (data as any).id

    // Try direct order_id first (some events include it)
    let orderId = (data as any).order_id ||
        (data as any).orderId ||
        (data as any).order?.id

    // If no order_id, query the database directly using SQL
    if (!orderId && fulfillmentId) {
        try {
            const pgConnection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
            const queryResult = await pgConnection.raw(`
                SELECT order_id 
                FROM order_fulfillment 
                WHERE fulfillment_id = ?
                LIMIT 1
            `, [fulfillmentId])

            if (queryResult.rows && queryResult.rows.length > 0) {
                orderId = queryResult.rows[0].order_id
                console.log(`[Coin Activation] Found order ${orderId} from fulfillment ${fulfillmentId}`)
            }
        } catch (sqlErr) {
            console.log(`[Coin Activation] SQL query failed:`, sqlErr)
        }
    }

    if (!orderId) {
        console.log(`[Coin Activation] ⚠️ No order_id found for fulfillment ${fulfillmentId}, skipping...`)
        return
    }

    console.log(`[Coin Activation] 📦 Processing fulfillment for order ${orderId}`)

    try {
        // Get the frontend URL from environment
        const frontendUrl = process.env.STOREFRONT_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            "http://localhost:3000"

        console.log(`[Coin Activation] Calling webhook at ${frontendUrl}/api/webhooks/order-delivered`)

        // 1. Call the coin activation webhook
        const coinResponse = await fetch(`${frontendUrl}/api/webhooks/order-delivered`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-webhook-secret": process.env.MEDUSA_WEBHOOK_SECRET || "",
            },
            body: JSON.stringify({
                order_id: orderId,
                event: name,
            }),
        })

        if (coinResponse.ok) {
            const result = await coinResponse.json()
            console.log(`[Coin Activation] ✅ Coins activated for order ${orderId}:`, result)
        } else {
            const error = await coinResponse.text()
            console.error(`[Coin Activation] ❌ Failed to activate coins for order ${orderId}:`, error)
        }

        // 2. Call Affiliate Portal to update commission status
        const affiliateWebhookUrl = process.env.AFFILIATE_WEBHOOK_URL ?
            process.env.AFFILIATE_WEBHOOK_URL.replace('/commission', '/commission/update-status') :
            "http://localhost:3001/api/webhook/commission/update-status"

        console.log(`[Affiliate Commission] 更新 commission status at ${affiliateWebhookUrl}`)

        const affiliateResponse = await fetch(affiliateWebhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                order_id: orderId,
                status: "CREDITED"
            }),
        })

        if (affiliateResponse.ok) {
            console.log(`[Affiliate Commission] ✅ Commission status updated to CREDITED for order ${orderId}`)
        } else {
            const error = await affiliateResponse.text()
            console.error(`[Affiliate Commission] ❌ Failed to update commission status for order ${orderId}:`, error)
        }

    } catch (err) {
        console.error(`[Order Fulfilled] ❌ Error processing webhooks for order ${orderId}:`, err)
    }
}

console.log("[Coin Activation] 🚀 Subscriber loaded! Listening for Fulfillment Events...")

export const config: SubscriberConfig = {
    // Listen for MULTIPLE events to catch the correct one
    event: [
        "order.fulfillment_created",
        "fulfillment.created",
        "shipment.created",
        "delivery.created"
    ],
}

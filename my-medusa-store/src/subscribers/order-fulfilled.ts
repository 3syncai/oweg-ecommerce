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

        // Call the coin activation webhook
        const response = await fetch(`${frontendUrl}/api/webhooks/order-delivered`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Add webhook secret for security
                "x-webhook-secret": process.env.MEDUSA_WEBHOOK_SECRET || "",
            },
            body: JSON.stringify({
                order_id: orderId,
                event: name,
            }),
        })

        if (response.ok) {
            const result = await response.json()
            console.log(`[Coin Activation] ✅ Coins activated for order ${orderId}:`, result)
        } else {
            const error = await response.text()
            console.error(`[Coin Activation] ❌ Failed to activate coins for order ${orderId}:`, error)
        }
    } catch (err) {
        console.error(`[Coin Activation] ❌ Error calling webhook for order ${orderId}:`, err)
    }
}

export const config: SubscriberConfig = {
    // Listen for delivery created events (Medusa 2.0)
    // This fires when admin marks an order as delivered
    event: "delivery.created",
}

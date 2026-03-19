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
        // Get the frontend URL from environment (required)
        const frontendUrl = process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_APP_URL;

        if (!frontendUrl) {
            console.error(`[Coin Activation] ❌ STOREFRONT_URL or NEXT_PUBLIC_APP_URL environment variable not set! Cannot activate coins.`);
            return;
        }

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

        // 2. Call Affiliate Portal to update commission status to CREDITED
        const affiliateWebhookUrl = process.env.AFFILIATE_WEBHOOK_URL;

        if (!affiliateWebhookUrl) {
            console.error(`\n❌ CRITICAL ERROR: AFFILIATE_WEBHOOK_URL not set!`);
            console.error(`[Affiliate Commission] ⚠️ AFFILIATE_WEBHOOK_URL environment variable not set! Skipping commission update.`);
            return;
        }

        console.log(`\n${'='.repeat(80)}`);
        console.log(`🚚 ORDER FULFILLED - Commission Update to CREDITED`);
        console.log(`${'='.repeat(80)}`);
        console.log(`📦 Order ID: ${orderId}`);
        console.log(`🔗 Webhook URL: ${affiliateWebhookUrl}`);
        console.log(`${'='.repeat(80)}\n`);

        console.log(`[Affiliate Commission] Updating commission status at ${affiliateWebhookUrl}`)

        // First, try a direct order-level status update endpoint to avoid duplicate inserts.
        let statusUpdateApplied = false
        let statusUpdateUrl = process.env.AFFILIATE_COMMISSION_UPDATE_URL

        if (!statusUpdateUrl) {
            try {
                const parsed = new URL(affiliateWebhookUrl)
                statusUpdateUrl = `${parsed.origin}/api/webhook/commission/update-status`
            } catch (urlErr) {
                console.log(`[Affiliate Commission] Could not derive update-status URL:`, urlErr)
            }
        }

        if (statusUpdateUrl) {
            try {
                console.log(`[Affiliate Commission] Trying direct status update at ${statusUpdateUrl}`)
                const statusResp = await fetch(statusUpdateUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        order_id: orderId,
                        status: "CREDITED",
                    }),
                })

                if (statusResp.ok) {
                    const statusData = await statusResp.json()
                    const updatedCount = Number(statusData?.updated_count || 0)
                    if (updatedCount > 0) {
                        statusUpdateApplied = true
                        console.log(`[Affiliate Commission] ✅ Updated ${updatedCount} commission rows via direct status endpoint`)
                    } else {
                        console.log(`[Affiliate Commission] No rows updated by direct endpoint, continuing with item-wise fallback`)
                    }
                } else {
                    const statusErr = await statusResp.text()
                    console.log(`[Affiliate Commission] Direct status update failed: ${statusErr}`)
                }
            } catch (statusUpdateErr) {
                console.log(`[Affiliate Commission] Direct status update error:`, statusUpdateErr)
            }
        }

        if (statusUpdateApplied) {
            console.log(`[Affiliate Commission] Direct status update completed for order ${orderId}; skipping item-wise fallback`)
            return
        }

        // Query database for order details (same as COD/Razorpay routes)
        try {
            const { Pool } = await import('pg');
            const pool = new Pool({ connectionString: process.env.DATABASE_URL });

            console.log(`📊 Querying database for customer and order details...`);

            // Get customer and referral code
            const customerResult = await pool.query(
                `SELECT c.id, c.email, c.first_name || ' ' || c.last_name as name,
                        c.metadata->>'referral_code' as referral_code
                 FROM "order" o JOIN customer c ON o.customer_id = c.id
                 WHERE o.id = $1`,
                [orderId]
            );

            const customer = customerResult.rows[0];

            if (!customer?.referral_code) {
                console.log(`\n⚠️  No referral code found for order ${orderId}`);
                console.log(`[Affiliate Commission] No referral code found for order ${orderId}, skipping`);
                await pool.end();
                return;
            }

            console.log(`✅ Found customer: ${customer.name}`);
            console.log(`🏷️  Affiliate Code: ${customer.referral_code}\n`);

            // Get order items
            const itemsResult = await pool.query(
                `SELECT oi.id, pv.product_id, oi.quantity, oli.unit_price, p.title as product_name
                 FROM order_item oi
                 JOIN order_line_item oli ON oi.item_id = oli.id
                 LEFT JOIN product_variant pv ON oli.variant_id = pv.id
                 LEFT JOIN product p ON pv.product_id = p.id
                 WHERE oi.order_id = $1`,
                [orderId]
            );

            console.log(`📦 Found ${itemsResult.rows.length} items in order\n`);

            // Send webhook for each item with status: CREDITED
            let successCount = 0;
            let failCount = 0;

            for (const item of itemsResult.rows) {
                const unitPrice = parseFloat(item.unit_price || 0);
                const payload = {
                    order_id: orderId,
                    affiliate_code: customer.referral_code,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    quantity: item.quantity,
                    item_price: unitPrice / 100, // Convert to rupees
                    order_amount: unitPrice * (item.quantity || 1),
                    status: "CREDITED", // Update to CREDITED on fulfillment
                    customer_id: customer.id,
                    customer_name: customer.name,
                    customer_email: customer.email,
                };

                console.log(`\n📤 Updating commission to CREDITED for: ${item.product_name}`);
                console.log(`   Product ID: ${item.product_id}`);
                console.log(`   Amount: ₹${unitPrice / 100}`);
                console.log(`   Commission Status: PENDING → CREDITED`);

                const affiliateResponse = await fetch(affiliateWebhookUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                });

                if (affiliateResponse.ok) {
                    const result = await affiliateResponse.json();
                    successCount++;
                    console.log(`✅ Commission updated to CREDITED for ${item.product_name}`);
                    console.log(`   Response:`, JSON.stringify(result, null, 2));
                } else {
                    failCount++;
                    const error = await affiliateResponse.text();
                    console.error(`❌ Failed to update ${item.product_name}`);
                    console.error(`   Status: ${affiliateResponse.status}`);
                    console.error(`   Error: ${error}`);
                }
            }

            console.log(`\n${'='.repeat(80)}`);
            console.log(`💰 COMMISSION UPDATE SUMMARY`);
            console.log(`${'='.repeat(80)}`);
            console.log(`✅ Updated to CREDITED: ${successCount}`);
            console.log(`❌ Failed: ${failCount}`);
            console.log(`📝 Wallets should now be credited with commission amounts`);
            console.log(`${'='.repeat(80)}\n`);

            await pool.end();
        } catch (dbErr) {
            console.error(`\n❌ DATABASE ERROR:`, dbErr);
            console.error(`[Affiliate Commission] ❌ Database query failed:`, dbErr);
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

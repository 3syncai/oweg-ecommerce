import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

// Delay before coins become usable after delivery (5 minutes in ms)
const ACTIVATION_DELAY_MS = 5 * 60 * 1000 // 5 minutes

/**
 * POST /api/webhooks/order-delivered
 * 
 * Webhook endpoint for when an order is marked as delivered.
 * This activates PENDING coins and adds them to the customer's wallet balance.
 * 
 * The coins become usable after a 5-minute delay from delivery confirmation.
 * 
 * Expected payload:
 * {
 *   "event": "order.delivered" | "order.fulfilled",
 *   "data": {
 *     "id": "order_123"
 *   }
 * }
 * 
 * Can also be called directly with: { "order_id": "order_123" }
 */
export async function POST(req: NextRequest) {
    console.log("=== ORDER DELIVERED WEBHOOK ===")

    try {
        // Verify webhook secret for security
        const webhookSecret = process.env.MEDUSA_WEBHOOK_SECRET
        const providedSecret = req.headers.get("x-webhook-secret")

        if (webhookSecret && providedSecret !== webhookSecret) {
            console.warn("Invalid webhook secret received")
            return NextResponse.json(
                { error: "Unauthorized - invalid webhook secret" },
                { status: 401 }
            )
        }

        const body = await req.json()

        // Extract order ID from various payload formats
        const orderId = body.order_id || body.data?.id || body.id

        if (!orderId) {
            console.error("No order ID in webhook payload")
            return NextResponse.json(
                { error: "Missing order_id in payload" },
                { status: 400 }
            )
        }

        console.log(`Processing delivery for order: ${orderId}`)

        if (!DATABASE_URL) {
            console.error("DATABASE_URL not configured")
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            )
        }

        const pool = new Pool({ connectionString: DATABASE_URL })

        try {
            // Step 1: Find PENDING coins for this order
            const pendingResult = await pool.query(`
        SELECT id, customer_id, amount, expiry_date
        FROM wallet_transactions
        WHERE order_id = $1 
          AND transaction_type = 'EARNED'
          AND status = 'PENDING'
      `, [orderId])

            if (pendingResult.rows.length === 0) {
                console.log(`No pending coins found for order ${orderId}`)
                await pool.end()
                return NextResponse.json({
                    success: true,
                    message: "No pending coins to activate (order may not have earned coins or already activated)",
                    activated: false,
                    amount: 0
                })
            }

            const pendingTx = pendingResult.rows[0]
            const customerId = pendingTx.customer_id
            const amount = parseFloat(pendingTx.amount)

            // Calculate when coins will be usable (5 minutes from now)
            const unlockTime = new Date(Date.now() + ACTIVATION_DELAY_MS)

            console.log(`Activating ${amount} coins for customer ${customerId}, usable at ${unlockTime.toISOString()}`)

            // Step 2: Update status to ACTIVE and store unlock time
            // Coins won't be usable until unlock_at time has passed
            const newExpiry = new Date()
            newExpiry.setFullYear(newExpiry.getFullYear() + 1) // 1 year from delivery

            // Store unlock_at as metadata JSON since we may not have a column
            await pool.query(`
        UPDATE wallet_transactions
        SET status = 'ACTIVE',
            expiry_date = $1,
            description = description || ' (unlocks at ' || $3 || ')',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('unlock_at', $3)
        WHERE id = $2
      `, [newExpiry.toISOString(), pendingTx.id, unlockTime.toISOString()])

            // Step 3: Add to wallet balance immediately
            // The wallet API will check unlock_at before allowing redemption
            await pool.query(`
        UPDATE customer_wallet
        SET coins_balance = coins_balance + $1,
            updated_at = NOW()
        WHERE customer_id = $2
      `, [amount, customerId])

            // Step 4: Get new balance
            const balanceResult = await pool.query(`
        SELECT coins_balance FROM customer_wallet WHERE customer_id = $1
      `, [customerId])

            const newBalance = balanceResult.rows[0]?.coins_balance || 0

            // ============================================
            // AFFILIATE COMMISSION: Credit to affiliate wallet
            // ============================================
            let affiliateCommissionTotal = 0
            try {
                // Find pending affiliate commissions for this order
                const affiliateCommissionResult = await pool.query(`
                    SELECT affiliate_code, affiliate_user_id, commission_amount, id
                    FROM affiliate_commission_log
                    WHERE order_id = $1 AND status = 'PENDING'
                `, [orderId])

                if (affiliateCommissionResult.rows.length > 0) {
                    const affiliateCode = affiliateCommissionResult.rows[0].affiliate_code
                    const affiliateUserId = affiliateCommissionResult.rows[0].affiliate_user_id

                    // Sum all commission for this order
                    for (const row of affiliateCommissionResult.rows) {
                        affiliateCommissionTotal += parseFloat(row.commission_amount)
                    }

                    console.log(`[AFFILIATE WEBHOOK] Code: ${affiliateCode}, UserID: ${affiliateUserId}, Total: ${affiliateCommissionTotal}`)

                    if (affiliateCommissionTotal > 0 && affiliateUserId) {
                        // Ensure affiliate has a wallet
                        const insertResult = await pool.query(`
                            INSERT INTO customer_wallet (customer_id, coins_balance)
                            VALUES ($1, 0)
                            ON CONFLICT (customer_id) DO NOTHING
                            RETURNING customer_id
                        `, [affiliateUserId])

                        console.log(`[AFFILIATE WEBHOOK] Wallet insert/check for ${affiliateUserId}:`, insertResult.rows)

                        // Add commission to affiliate wallet
                        const updateResult = await pool.query(`
                            UPDATE customer_wallet
                            SET coins_balance = coins_balance + $1,
                                updated_at = NOW()
                            WHERE customer_id = $2
                            RETURNING customer_id, coins_balance
                        `, [affiliateCommissionTotal, affiliateUserId])

                        console.log(`[AFFILIATE WEBHOOK] Wallet updated:`, updateResult.rows)

                        // Update commission log status to CREDITED with unlock time
                        const commissionUnlockTime = new Date(Date.now() + ACTIVATION_DELAY_MS)
                        for (const row of affiliateCommissionResult.rows) {
                            await pool.query(`
                                UPDATE affiliate_commission_log
                                SET status = 'CREDITED',
                                    credited_at = NOW(),
                                    unlock_at = $2
                                WHERE id = $1
                            `, [row.id, commissionUnlockTime.toISOString()])
                        }

                        console.log(`✅ Credited ₹${affiliateCommissionTotal.toFixed(2)} commission to affiliate ${affiliateCode} (user ${affiliateUserId})`)
                    } else {
                        console.log(`[AFFILIATE WEBHOOK] Skipped crediting - Total: ${affiliateCommissionTotal}, UserID: ${affiliateUserId}`)
                    }
                }
            } catch (affiliateErr) {
                console.error("Error crediting affiliate commission:", affiliateErr)
                // Don't fail the main webhook if affiliate commission fails
            }

            await pool.end()

            console.log(`✅ Activated ${amount} coins for customer ${customerId}. New balance: ${newBalance}`)

            return NextResponse.json({
                success: true,
                message: `Activated ${amount} coins for order ${orderId}`,
                activated: true,
                amount: amount,
                new_balance: newBalance,
                customer_id: customerId,
                usable_at: unlockTime.toISOString()
            })
        } catch (dbErr) {
            console.error("Database error in delivery webhook:", dbErr)
            await pool.end().catch(() => { })
            return NextResponse.json(
                { error: "Database error", details: String(dbErr) },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error("Order delivered webhook error:", error)
        return NextResponse.json(
            { error: "Internal server error", details: String(error) },
            { status: 500 }
        )
    }
}

// GET for testing and documentation
export async function GET() {
    return NextResponse.json({
        status: "ok",
        endpoint: "/api/webhooks/order-delivered",
        description: "Webhook to activate pending coins when order is delivered",
        expected_payload: {
            order_id: "order_123"
        },
        notes: [
            "Coins are created as PENDING when payment is confirmed",
            "This webhook activates them and adds to wallet balance",
            "Coins become usable 5 minutes after activation"
        ]
    })
}

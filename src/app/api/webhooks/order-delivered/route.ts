import { NextRequest, NextResponse } from "next/server"
import { earnCoins, creditAdjustment, getPool } from "@/lib/wallet-ledger"

export const dynamic = "force-dynamic"

const COIN_EARNING_RATE = 0.01 // 1% of order total

/**
 * POST /api/webhooks/order-delivered
 *
 * Webhook endpoint for when an order is marked as delivered.
 * Coins are earned ONLY after successful delivery.
 *
 * Expected payload:
 * {
 *   "event": "order.delivered" | "order.fulfilled",
 *   "data": { "id": "order_123" }
 * }
 *
 * Can also be called directly with: { "order_id": "order_123" }
 */
export async function POST(req: NextRequest) {
    console.log("=== ORDER DELIVERED WEBHOOK ===")

    try {
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
        const orderId = body.order_id || body.data?.id || body.id

        if (!orderId) {
            console.error("No order ID in webhook payload")
            return NextResponse.json(
                { error: "Missing order_id in payload" },
                { status: 400 }
            )
        }

        const pool = getPool()

        try {
            const orderResult = await pool.query(
                `SELECT customer_id FROM "order" WHERE id = $1`,
                [orderId]
            )

            const customerId = orderResult.rows[0]?.customer_id as string | undefined

            const summaryResult = await pool.query(
                `SELECT totals
                 FROM order_summary
                 WHERE order_id = $1
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [orderId]
            )
            const totals = summaryResult.rows[0]?.totals as
                | { current_order_total?: number; paid_total?: number; original_order_total?: number }
                | undefined
            const totalRupees = Number(
                totals?.current_order_total ??
                totals?.paid_total ??
                totals?.original_order_total ??
                0
            )
            const totalMinor = Math.round(totalRupees * 100)

            if (!customerId) {
                return NextResponse.json(
                    { error: "Order has no customer_id" },
                    { status: 400 }
                )
            }

            const coinsMinor = Math.round(totalMinor * COIN_EARNING_RATE)
            let earnResult = { applied: false, amount: 0 };

            if (coinsMinor > 0) {
                const expiryDate = new Date()
                expiryDate.setFullYear(expiryDate.getFullYear() + 1)

                earnResult = await earnCoins({
                    customerId,
                    orderId,
                    amountMinor: coinsMinor,
                    expiresAt: expiryDate.toISOString(),
                    metadata: { reason: "delivery_reward" }
                })
            }

            // ============================================
            // AFFILIATE COMMISSION: Credit to affiliate wallet
            // ============================================
            let affiliateCommissionTotal = 0
            try {
                const affiliateCommissionResult = await pool.query(`
                    SELECT *
                    FROM affiliate_commission_log
                    WHERE order_id = $1 AND status = 'PENDING'
                `, [orderId])

                if (affiliateCommissionResult.rows.length > 0) {
                    for (const row of affiliateCommissionResult.rows) {
                        let userId = row.affiliate_user_id;
                        const affiliateCode = row.affiliate_code;

                        // Robustness: If affiliate_user_id is missing, look it up
                        if (!userId && affiliateCode) {
                            console.log(`[AFFILIATE WEBHOOK] Missing user_id for code ${affiliateCode}, looking up in all tables...`);

                            // Check Affiliate User
                            let userLookup = await pool.query(`SELECT id FROM affiliate_user WHERE refer_code = $1`, [affiliateCode]);

                            // Check Branch Admin
                            if (userLookup.rows.length === 0) {
                                userLookup = await pool.query(`SELECT id FROM branch_admin WHERE refer_code = $1`, [affiliateCode]);
                            }

                            // Check Area/State Manager by EMAIL as fallback if code is generic (like 'AREA' or 'STATE')
                            if (userLookup.rows.length === 0) {
                                if (affiliateCode === 'AREA') {
                                    userLookup = await pool.query(`SELECT id FROM area_sales_manager WHERE email = $1`, [row.customer_email]);
                                } else if (affiliateCode === 'STATE') {
                                    userLookup = await pool.query(`SELECT id FROM state_admin WHERE email = $1`, [row.customer_email]);
                                }
                            }

                            if (userLookup.rows.length > 0) {
                                userId = userLookup.rows[0].id;
                                console.log(`[AFFILIATE WEBHOOK] Found user ${userId} for code ${affiliateCode}`);
                            } else {
                                console.warn(`[AFFILIATE WEBHOOK] Could not find user for code ${affiliateCode}`);
                            }
                        }

                        if (userId) {
                            const commissionAmount = parseFloat(row.commission_amount);
                            if (commissionAmount > 0) {
                                affiliateCommissionTotal += commissionAmount;
                                const commissionMinor = Math.round(commissionAmount * 100)

                                await creditAdjustment({
                                    customerId: userId,
                                    referenceId: `affiliate:${row.id}`,
                                    idempotencyKey: `affiliate:${row.id}`,
                                    amountMinor: commissionMinor,
                                    reason: `Affiliate commission for order ${orderId}`,
                                    metadata: { affiliate_code: affiliateCode, order_id: orderId, log_id: row.id }
                                })

                                const commissionUnlockTime = new Date(Date.now() + 5 * 60 * 1000)
                                await pool.query(`
                                    UPDATE affiliate_commission_log
                                    SET status = 'CREDITED',
                                        credited_at = NOW(),
                                        unlock_at = $2,
                                        affiliate_user_id = $3
                                    WHERE id = $1
                                `, [row.id, commissionUnlockTime.toISOString(), userId])
                            }
                        }
                    }
                }
            } catch (affiliateErr) {
                console.error("Error crediting affiliate commission:", affiliateErr)
            }

            return NextResponse.json({
                success: true,
                message: `Awarded coins for order ${orderId}`,
                activated: earnResult.applied,
                amount: coinsMinor / 100,
                customer_id: customerId,
                affiliate_commission: affiliateCommissionTotal
            })
        } catch (dbErr) {
            console.error("Database error in delivery webhook:", dbErr)
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

export async function GET() {
    return NextResponse.json({
        status: "ok",
        endpoint: "/api/webhooks/order-delivered",
        description: "Webhook to award coins when order is delivered",
        expected_payload: {
            order_id: "order_123"
        },
        notes: [
            "Coins are earned only after delivery",
            "Ledger entries are append-only and idempotent",
            "Affiliate commissions are also credited here"
        ]
    })
}

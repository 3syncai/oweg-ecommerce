import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * GET /api/customer-affiliate/stats
 * Returns the customer-affiliate dashboard stats:
 *  - referred customers list
 *  - earned coins / pending coins
 *  - per-referral order info
 *
 * Headers: x-customer-id
 */
export async function GET(req: NextRequest) {
    const customerId = req.headers.get("x-customer-id")

    if (!customerId) {
        return NextResponse.json(
            { error: "Not authenticated" },
            { status: 401 }
        )
    }

    if (!DATABASE_URL) {
        return NextResponse.json(
            { error: "Database configuration missing" },
            { status: 500 }
        )
    }

    const pool = new Pool({ connectionString: DATABASE_URL })

    try {
        const affRes = await pool.query(
            `SELECT id, refer_code, earned_coins, pending_coins, created_at
             FROM customer_referrer
             WHERE customer_id = $1
             LIMIT 1`,
            [customerId]
        )

        if (affRes.rows.length === 0) {
            await pool.end()
            return NextResponse.json(
                { is_affiliate: false, message: "Not an affiliate yet" },
                { status: 200 }
            )
        }

        const aff = affRes.rows[0]
        const referCode = aff.refer_code as string

        const referralsRes = await pool.query(
            `SELECT id, refer_code, referred_customer_id, referred_email, referred_name,
                    total_orders, total_order_value, coins_earned, first_order_at, referred_at
             FROM customer_referrer_referrals
             WHERE refer_code = $1
             ORDER BY referred_at DESC
             LIMIT 100`,
            [referCode]
        )

        const summaryRes = await pool.query(
            `SELECT
                COUNT(*) AS total_referrals,
                COUNT(CASE WHEN total_orders > 0 THEN 1 END) AS active_referrals,
                COALESCE(SUM(total_orders), 0) AS total_orders,
                COALESCE(SUM(total_order_value), 0) AS total_order_value,
                COALESCE(SUM(coins_earned), 0) AS total_coins_from_referrals
             FROM customer_referrer_referrals
             WHERE refer_code = $1`,
            [referCode]
        )

        const coinsRes = await pool.query(
            `SELECT status, COALESCE(SUM(coins), 0) AS amount, COUNT(*) AS count
             FROM customer_referrer_coins_log
             WHERE affiliate_customer_id = $1
             GROUP BY status`,
            [customerId]
        )

        const recentActivityRes = await pool.query(
            `SELECT id, order_id, referred_customer_id, coins, status, reason, created_at, unlocked_at
             FROM customer_referrer_coins_log
             WHERE affiliate_customer_id = $1
             ORDER BY created_at DESC
             LIMIT 20`,
            [customerId]
        )

        await pool.end()

        const summary = summaryRes.rows[0] || {}
        const coinsByStatus: Record<string, { amount: number; count: number }> = {}
        for (const r of coinsRes.rows) {
            coinsByStatus[r.status] = {
                amount: parseFloat(r.amount) || 0,
                count: parseInt(r.count, 10) || 0,
            }
        }

        const maskEmail = (e: string | null) =>
            !e ? null : e.replace(/(.{2})(.*)(@.*)/, "$1***$3")

        return NextResponse.json({
            is_affiliate: true,
            refer_code: referCode,
            coins: {
                earned: parseFloat(aff.earned_coins) || 0,
                pending: parseFloat(aff.pending_coins) || 0,
                earned_log_amount: coinsByStatus.EARNED?.amount || 0,
                pending_log_amount: coinsByStatus.PENDING?.amount || 0,
                cancelled_log_amount: coinsByStatus.CANCELLED?.amount || 0,
                reversed_log_amount: coinsByStatus.REVERSED?.amount || 0,
            },
            summary: {
                total_referrals: parseInt(summary.total_referrals, 10) || 0,
                active_referrals: parseInt(summary.active_referrals, 10) || 0,
                total_orders: parseInt(summary.total_orders, 10) || 0,
                total_order_value: parseFloat(summary.total_order_value) || 0,
            },
            referrals: referralsRes.rows.map((r: { referred_email: string | null; total_orders: number | string; total_order_value: number | string; coins_earned: number | string; referred_name: string | null; referred_customer_id: string; first_order_at: string | null; referred_at: string }) => ({
                id: (r as unknown as { id: string }).id,
                referred_customer_id: r.referred_customer_id,
                referred_email: maskEmail(r.referred_email),
                referred_name: r.referred_name,
                total_orders: parseInt(String(r.total_orders), 10) || 0,
                total_order_value: parseFloat(String(r.total_order_value)) || 0,
                coins_earned: parseFloat(String(r.coins_earned)) || 0,
                first_order_at: r.first_order_at,
                referred_at: r.referred_at,
            })),
            recent_activity: recentActivityRes.rows.map((r: {
                id: string
                order_id: string | null
                referred_customer_id: string | null
                coins: number | string
                status: string
                reason: string | null
                created_at: string
                unlocked_at: string | null
            }) => ({
                id: r.id,
                order_id: r.order_id,
                referred_customer_id: r.referred_customer_id,
                coins: parseFloat(String(r.coins)) || 0,
                status: r.status,
                reason: r.reason,
                created_at: r.created_at,
                unlocked_at: r.unlocked_at,
            })),
        })
    } catch (error) {
        await pool.end().catch(() => { })
        console.error("[customer-affiliate/stats] DB error:", error)
        return NextResponse.json(
            {
                error: "Database error",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        )
    }
}

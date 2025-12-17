import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

/**
 * GET /api/affiliate/stats
 * Get affiliate statistics (referrals, commission, etc.)
 * 
 * Headers: x-affiliate-code (affiliate's refer_code)
 */
export async function GET(req: NextRequest) {
    try {
        const affiliateCode = req.headers.get("x-affiliate-code")

        if (!affiliateCode) {
            return NextResponse.json(
                { error: "Affiliate code required" },
                { status: 400 }
            )
        }

        const pool = new Pool({ connectionString: process.env.DATABASE_URL })

        try {
            // 1. Get total referred customers count
            const referralsResult = await pool.query(`
                SELECT 
                    COUNT(*) as total_referrals,
                    COUNT(CASE WHEN total_orders > 0 THEN 1 END) as active_referrals,
                    COALESCE(SUM(total_orders), 0) as total_orders_from_referrals,
                    COALESCE(SUM(total_order_value), 0) as total_order_value,
                    COALESCE(SUM(total_commission), 0) as total_commission
                FROM affiliate_referrals
                WHERE affiliate_code = $1
            `, [affiliateCode])

            const referralStats = referralsResult.rows[0]

            // 2. Get commission breakdown by status
            const commissionResult = await pool.query(`
                SELECT 
                    status,
                    COUNT(*) as count,
                    COALESCE(SUM(commission_amount), 0) as amount
                FROM affiliate_commission_log
                WHERE affiliate_code = $1
                GROUP BY status
            `, [affiliateCode])

            const commissionByStatus: Record<string, { count: number, amount: number }> = {}
            for (const row of commissionResult.rows) {
                commissionByStatus[row.status] = {
                    count: parseInt(row.count),
                    amount: parseFloat(row.amount)
                }
            }

            // 3. Get recent referrals (last 10)
            const recentReferralsResult = await pool.query(`
                SELECT 
                    id,
                    customer_email,
                    customer_name,
                    referred_at,
                    first_order_at,
                    total_orders,
                    total_commission
                FROM affiliate_referrals
                WHERE affiliate_code = $1
                ORDER BY referred_at DESC
                LIMIT 10
            `, [affiliateCode])

            // 4. Get recent commission logs (last 10)
            const recentCommissionResult = await pool.query(`
                SELECT 
                    id,
                    order_id,
                    product_name,
                    order_amount,
                    commission_rate,
                    commission_amount,
                    commission_source,
                    status,
                    created_at
                FROM affiliate_commission_log
                WHERE affiliate_code = $1
                ORDER BY created_at DESC
                LIMIT 10
            `, [affiliateCode])

            // 5. Get wallet balance (if affiliate has one)
            // First, find affiliate_user_id from the affiliate_user table
            const affiliateUserResult = await pool.query(`
                SELECT id FROM affiliate_user WHERE refer_code = $1
            `, [affiliateCode])

            let walletBalance = 0
            let pendingBalance = 0
            if (affiliateUserResult.rows.length > 0) {
                const affiliateUserId = affiliateUserResult.rows[0].id

                // Check if they have a wallet
                const walletResult = await pool.query(`
                    SELECT coins_balance FROM customer_wallet WHERE customer_id = $1
                `, [affiliateUserId])

                if (walletResult.rows.length > 0) {
                    walletBalance = parseFloat(walletResult.rows[0].coins_balance) || 0
                }

                // Get pending (locked) commission
                const pendingResult = await pool.query(`
                    SELECT COALESCE(SUM(commission_amount), 0) as pending
                    FROM affiliate_commission_log
                    WHERE affiliate_code = $1
                      AND status = 'CREDITED'
                      AND unlock_at IS NOT NULL
                      AND unlock_at > NOW()
                `, [affiliateCode])
                pendingBalance = parseFloat(pendingResult.rows[0]?.pending) || 0
            }

            await pool.end()

            return NextResponse.json({
                affiliate_code: affiliateCode,
                referrals: {
                    total: parseInt(referralStats.total_referrals) || 0,
                    active: parseInt(referralStats.active_referrals) || 0,
                    total_orders: parseInt(referralStats.total_orders_from_referrals) || 0,
                    total_order_value: parseFloat(referralStats.total_order_value) || 0
                },
                commission: {
                    total_earned: parseFloat(referralStats.total_commission) || 0,
                    pending: commissionByStatus['PENDING']?.amount || 0,
                    credited: commissionByStatus['CREDITED']?.amount || 0,
                    reversed: commissionByStatus['REVERSED']?.amount || 0
                },
                wallet: {
                    balance: walletBalance,
                    locked: pendingBalance
                },
                recent_referrals: recentReferralsResult.rows,
                recent_commissions: recentCommissionResult.rows
            })
        } catch (dbError) {
            console.error("Database error:", dbError)
            await pool.end().catch(() => { })
            return NextResponse.json(
                { error: "Database error", details: String(dbError) },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error("Error fetching affiliate stats:", error)
        return NextResponse.json(
            { error: "Failed to fetch stats" },
            { status: 500 }
        )
    }
}

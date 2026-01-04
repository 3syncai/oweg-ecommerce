import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

/**
 * DEBUG ENDPOINT - Check affiliate wallet status
 * GET /api/affiliate/debug-wallet?code=AFFILIATE_CODE
 */
export async function GET(req: NextRequest) {
    const affiliateCode = req.nextUrl.searchParams.get("code")

    if (!affiliateCode) {
        return NextResponse.json({ error: "code parameter required" }, { status: 400 })
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL })

    try {
        // 1. Get affiliate user
        const userResult = await pool.query(`
            SELECT id, email, refer_code 
            FROM affiliate_user 
            WHERE refer_code = $1
        `, [affiliateCode])

        if (userResult.rows.length === 0) {
            await pool.end()
            return NextResponse.json({ error: "Affiliate not found" }, { status: 404 })
        }

        const affiliateUser = userResult.rows[0]

        // 2. Check wallet
        const walletResult = await pool.query(`
            SELECT customer_id, coins_balance, created_at, updated_at
            FROM customer_wallet
            WHERE customer_id = $1
        `, [affiliateUser.id])

        // 3. Check commission logs
        const commissionResult = await pool.query(`
            SELECT id, affiliate_user_id, order_id, commission_amount, status, created_at, credited_at
            FROM affiliate_commission_log
            WHERE affiliate_code = $1
            ORDER BY created_at DESC
            LIMIT 5
        `, [affiliateCode])

        await pool.end()

        return NextResponse.json({
            affiliate_user: affiliateUser,
            wallet: walletResult.rows[0] || null,
            wallet_exists: walletResult.rows.length > 0,
            recent_commissions: commissionResult.rows,
            debug_info: {
                affiliate_user_id: affiliateUser.id,
                wallet_customer_id: walletResult.rows[0]?.customer_id,
                ids_match: walletResult.rows[0]?.customer_id === affiliateUser.id
            }
        })

    } catch (error) {
        await pool.end().catch(() => { })
        return NextResponse.json({
            error: "Database error",
            details: String(error)
        }, { status: 500 })
    }
}

import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

/**
 * GET /api/affiliate/referrals
 * List all customers referred by this affiliate
 * 
 * Headers: x-affiliate-code (affiliate's refer_code)
 * Query: page, limit
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

        const { searchParams } = new URL(req.url)
        const page = parseInt(searchParams.get("page") || "1")
        const limit = parseInt(searchParams.get("limit") || "20")
        const offset = (page - 1) * limit

        const pool = new Pool({ connectionString: process.env.DATABASE_URL })

        try {
            // Get total count
            const countResult = await pool.query(`
                SELECT COUNT(*) as total
                FROM affiliate_referrals
                WHERE affiliate_code = $1
            `, [affiliateCode])

            const total = parseInt(countResult.rows[0].total) || 0

            // Get referrals with pagination
            const referralsResult = await pool.query(`
                SELECT 
                    id,
                    customer_id,
                    customer_email,
                    customer_name,
                    referred_at,
                    first_order_at,
                    total_orders,
                    total_order_value,
                    total_commission
                FROM affiliate_referrals
                WHERE affiliate_code = $1
                ORDER BY referred_at DESC
                LIMIT $2 OFFSET $3
            `, [affiliateCode, limit, offset])

            await pool.end()

            // Mask customer emails for privacy
            const maskedReferrals = referralsResult.rows.map((r: any) => ({
                ...r,
                customer_email: r.customer_email
                    ? r.customer_email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
                    : null
            }))

            return NextResponse.json({
                referrals: maskedReferrals,
                pagination: {
                    page,
                    limit,
                    total,
                    total_pages: Math.ceil(total / limit)
                }
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
        console.error("Error fetching referrals:", error)
        return NextResponse.json(
            { error: "Failed to fetch referrals" },
            { status: 500 }
        )
    }
}

/**
 * POST /api/affiliate/referrals
 * Track a new referral when customer signs up with affiliate code
 * 
 * Body: { affiliate_code, customer_id, customer_email, customer_name }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { affiliate_code, customer_id, customer_email, customer_name } = body

        if (!affiliate_code || !customer_id) {
            return NextResponse.json(
                { error: "affiliate_code and customer_id required" },
                { status: 400 }
            )
        }

        const pool = new Pool({ connectionString: process.env.DATABASE_URL })

        try {
            // Find affiliate_user_id if exists
            const affiliateResult = await pool.query(`
                SELECT id FROM affiliate_user WHERE refer_code = $1
            `, [affiliate_code])

            const affiliateUserId = affiliateResult.rows[0]?.id || null

            // Insert or update referral record
            await pool.query(`
                INSERT INTO affiliate_referrals 
                    (affiliate_code, affiliate_user_id, customer_id, customer_email, customer_name)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (affiliate_code, customer_id) 
                DO UPDATE SET 
                    customer_email = EXCLUDED.customer_email,
                    customer_name = EXCLUDED.customer_name
            `, [affiliate_code, affiliateUserId, customer_id, customer_email, customer_name])

            await pool.end()

            console.log(`[Affiliate] Tracked referral: ${customer_email} referred by ${affiliate_code}`)

            return NextResponse.json({
                success: true,
                message: "Referral tracked"
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
        console.error("Error tracking referral:", error)
        return NextResponse.json(
            { error: "Failed to track referral" },
            { status: 500 }
        )
    }
}

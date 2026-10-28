import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { authorizeReferralService } from "@/lib/referral-auth"

/**
 * GET /api/affiliate/referrals
 * List all customers referred by this affiliate
 * 
 * Requires server authentication (INTERNAL_API_SECRET); x-affiliate-code selects the scope.
 * Query: page, limit
 */
export async function GET(req: NextRequest) {
    const authError = authorizeReferralService(req)
    if (authError) return authError
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

// Preserve the legacy request shape, with the same authenticated ownership
// and locked-attribution rules as the storefront save endpoint.
export { POST } from "@/app/api/store/save-referral/route"

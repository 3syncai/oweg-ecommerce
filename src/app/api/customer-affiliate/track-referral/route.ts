import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * POST /api/customer-affiliate/track-referral
 *
 * Records the link between a customer-referrer (affiliate) and a referred
 * customer in `customer_referrer_referrals`. Idempotent — calling twice with
 * the same (refer_code, referred_customer_id) is a no-op.
 *
 * Body: {
 *   refer_code: string,
 *   referred_customer_id: string,
 *   referred_email?: string,
 *   referred_name?: string
 * }
 *
 * Independent from the existing `/api/store/save-referral` endpoint, which is
 * left untouched and continues to manage the agent-side referral system.
 */
export async function POST(req: NextRequest) {
    if (!DATABASE_URL) {
        return NextResponse.json(
            { error: "Database configuration missing" },
            { status: 500 }
        )
    }

    let body: {
        refer_code?: string
        referred_customer_id?: string
        referred_email?: string
        referred_name?: string
    }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        )
    }

    const referCode = (body.refer_code || "").trim().toUpperCase()
    const referredId = (body.referred_customer_id || "").trim()

    if (!referCode || !referredId) {
        return NextResponse.json(
            { error: "refer_code and referred_customer_id are required" },
            { status: 400 }
        )
    }

    const pool = new Pool({ connectionString: DATABASE_URL })

    try {
        const referrerRes = await pool.query(
            `SELECT customer_id FROM customer_referrer
             WHERE UPPER(refer_code) = $1
             LIMIT 1`,
            [referCode]
        )

        if (referrerRes.rows.length === 0) {
            await pool.end()
            return NextResponse.json(
                { error: "Affiliate code not found" },
                { status: 404 }
            )
        }

        const affiliateCustomerId: string = referrerRes.rows[0].customer_id

        if (affiliateCustomerId === referredId) {
            await pool.end()
            return NextResponse.json(
                { error: "You can't use your own affiliate code." },
                { status: 400 }
            )
        }

        await pool.query(
            `INSERT INTO customer_referrer_referrals
                (refer_code, affiliate_customer_id, referred_customer_id,
                 referred_email, referred_name)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (refer_code, referred_customer_id) DO NOTHING`,
            [
                referCode,
                affiliateCustomerId,
                referredId,
                body.referred_email || null,
                body.referred_name || null,
            ]
        )

        await pool.end()

        return NextResponse.json({
            success: true,
            refer_code: referCode,
            affiliate_customer_id: affiliateCustomerId,
        })
    } catch (error) {
        await pool.end().catch(() => { })
        console.error("[customer-affiliate/track-referral] DB error:", error)
        return NextResponse.json(
            {
                error: "Database error",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        )
    }
}

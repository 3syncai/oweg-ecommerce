import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
    console.error("DATABASE_URL environment variable is not set")
}

/**
 * GET /api/store/referral-code
 * Fetches the referral code for the authenticated customer from customer_referral table
 */
export async function GET(req: NextRequest) {
    console.log('=== REFERRAL CODE API CALLED ===')

    try {
        // Get customer ID from header
        const customerId = req.headers.get("x-customer-id")

        console.log('Customer ID from header:', customerId)
        console.log('DATABASE_URL exists:', !!DATABASE_URL)

        if (!customerId) {
            console.log('No customer ID provided')
            return NextResponse.json(
                { referral_code: null, message: "Not authenticated" },
                { status: 200 }
            )
        }

        if (!DATABASE_URL) {
            console.error('DATABASE_URL not configured!')
            return NextResponse.json(
                { error: "Database configuration missing" },
                { status: 500 }
            )
        }

        console.log('Creating database connection...')
        const pool = new Pool({ connectionString: DATABASE_URL })

        try {
            console.log('Querying customer_referral for customer:', customerId)

            // Query customer_referral table - only select referral_code
            const result = await pool.query(
                `SELECT referral_code
         FROM customer_referral
         WHERE customer_id = $1
         LIMIT 1`,
                [customerId]
            )

            console.log('Query result rows:', result.rows.length)

            await pool.end()

            if (result.rows.length > 0) {
                const referralData = result.rows[0]
                console.log('✅ Found referral code:', referralData.referral_code)

                return NextResponse.json({
                    referral_code: referralData.referral_code,
                })
            }

            console.log('No referral code found for customer')
            // No referral code found for this customer
            return NextResponse.json({
                referral_code: null,
                message: "No referral code found",
            })
        } catch (dbError) {
            console.error('❌ Database query error:', dbError)
            await pool.end().catch(() => { })
            return NextResponse.json(
                { error: "Failed to fetch referral code", details: dbError instanceof Error ? dbError.message : String(dbError) },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error('❌ API error:', error)
        return NextResponse.json(
            { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        )
    }
}

import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * POST /api/store/save-referral
 * Explicitly saves referral code for a customer.
 * Intended to be called from the client side after successful signup.
 */
export async function POST(req: NextRequest) {
    console.log('=== SAVE REFERRAL API CALLED (EXPLICIT) ===')

    try {
        const body = await req.json()
        const { customer_id, referral_code } = body

        console.log('Received save request:', { customer_id, referral_code })

        // Basic validation
        if (!customer_id || !referral_code) {
            console.warn('Missing required fields')
            return NextResponse.json(
                { error: "Missing customer_id or referral_code" },
                { status: 400 }
            )
        }

        if (!DATABASE_URL) {
            console.error('DATABASE_URL is missing')
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            )
        }

        // Database operation
        const pool = new Pool({ connectionString: DATABASE_URL })

        try {
            console.log(`Connecting to DB to save referral ${referral_code} for ${customer_id}...`)

            // Delete any existing referral for this customer first
            await pool.query(
                `DELETE FROM customer_referral WHERE customer_id = $1`,
                [customer_id]
            )

            // Then insert the new one
            await pool.query(
                `INSERT INTO customer_referral (customer_id, referral_code, created_at)
                VALUES ($1, $2, NOW())`,
                [customer_id, referral_code]
            )

            // Also track in affiliate_referrals table for affiliate dashboard
            // Get customer details
            const customerResult = await pool.query(
                `SELECT email, first_name, last_name FROM customer WHERE id = $1`,
                [customer_id]
            )
            const customerData = customerResult.rows[0]
            const customerEmail = customerData?.email
            const customerName = `${customerData?.first_name || ''} ${customerData?.last_name || ''}`.trim()

            // Find affiliate_user_id if exists
            const affiliateResult = await pool.query(
                `SELECT id FROM affiliate_user WHERE refer_code = $1`,
                [referral_code]
            )
            const affiliateUserId = affiliateResult.rows[0]?.id || null

            await pool.query(
                `INSERT INTO affiliate_referrals 
                   (affiliate_code, affiliate_user_id, customer_id, customer_email, customer_name)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (affiliate_code, customer_id) DO UPDATE 
                 SET customer_email = EXCLUDED.customer_email,
                     customer_name = EXCLUDED.customer_name`,
                [referral_code, affiliateUserId, customer_id, customerEmail, customerName]
            )

            console.log(`✅ Tracked affiliate referral for: ${referral_code}`)

            await pool.end()
            console.log('✅ Referral code saved successfully (DB insert/update complete)')

            return NextResponse.json({ success: true, message: "Referral saved" })
        } catch (dbError) {
            console.error('❌ Database insert error:', dbError)
            await pool.end().catch(() => { })
            return NextResponse.json(
                { error: "Database error", details: String(dbError) },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error('❌ API Endpoint error:', error)
        return NextResponse.json(
            { error: "Internal server error", details: String(error) },
            { status: 500 }
        )
    }
}

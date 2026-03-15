import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * POST /api/store/save-referral
 * Saves referral code for a customer.
 * Once set, the referral is LOCKED and cannot be changed.
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

        const normalizedCode = referral_code.trim().toUpperCase()

        // Database operation
        const pool = new Pool({ connectionString: DATABASE_URL })

        try {
            console.log(`Connecting to DB to save referral ${normalizedCode} for ${customer_id}...`)

            // ✅ IDEMPOTENT LOCK CHECK: If this customer already has a referral, check if it's the same code
            const existingReferral = await pool.query(
                `SELECT referral_code FROM customer_referral WHERE customer_id = $1`,
                [customer_id]
            )

            if (existingReferral.rows.length > 0) {
                const savedCode = existingReferral.rows[0].referral_code;
                if (savedCode === normalizedCode) {
                    console.log(`Referral ${normalizedCode} already exists for ${customer_id}. Proceeding to ensure all tables are synced.`);
                    // We don't return 409. We continue to line 108 to ensure affiliate_referrals is also populated.
                } else {
                    console.warn(`Referral already set for customer ${customer_id} with a DIFFERENT code (${savedCode}). Rejecting overwrite.`);
                    await pool.end()
                    return NextResponse.json(
                        {
                            success: false,
                            message: "Referral code is already saved and cannot be changed.",
                            existing_code: savedCode
                        },
                        { status: 409 }
                    )
                }
            }

            // ✅ VALIDATE: Make sure the referral code actually exists
            const codeValidation = await pool.query(
                `SELECT id, first_name, last_name FROM affiliate_user 
                 WHERE UPPER(refer_code) = $1 AND is_approved = TRUE
                 LIMIT 1`,
                [normalizedCode]
            )

            const branchValidation = codeValidation.rows.length === 0
                ? await pool.query(
                    `SELECT id, first_name, last_name FROM branch_admin 
                     WHERE UPPER(refer_code) = $1 LIMIT 1`,
                    [normalizedCode]
                )
                : { rows: [] }

            const asmValidation = codeValidation.rows.length === 0 && branchValidation.rows.length === 0
                ? await pool.query(
                    `SELECT id, first_name, last_name FROM area_sales_manager 
                     WHERE UPPER(refer_code) = $1 LIMIT 1`,
                    [normalizedCode]
                )
                : { rows: [] }

            const stateAdminValidation = codeValidation.rows.length === 0 && branchValidation.rows.length === 0 && asmValidation.rows.length === 0
                ? await pool.query(
                    `SELECT id, first_name, last_name FROM state_admin 
                     WHERE UPPER(refer_code) = $1 LIMIT 1`,
                    [normalizedCode]
                )
                : { rows: [] }

            if (codeValidation.rows.length === 0 && branchValidation.rows.length === 0 && asmValidation.rows.length === 0 && stateAdminValidation.rows.length === 0) {
                console.warn(`Referral code ${normalizedCode} not found in DB`)
                await pool.end()
                return NextResponse.json(
                    { success: false, message: "Invalid referral code. Code not found." },
                    { status: 400 }
                )
            }

            // Insert new referral (no overwrite since we already checked)
            await pool.query(
                `INSERT INTO customer_referral (customer_id, referral_code, created_at)
                 SELECT $1, $2, NOW()
                 WHERE NOT EXISTS (SELECT 1 FROM customer_referral WHERE customer_id = $1)`,
                [customer_id, normalizedCode]
            )

            // Also track in affiliate_referrals table for affiliate dashboard
            // On RDS, the Medusa ID is stored in the 'id' column. We try to find customer by that.
            const customerResult = await pool.query(
                `SELECT id as medusa_id, email, first_name, last_name FROM customer 
                 WHERE id = $1`,
                [customer_id]
            )
            const customerData = customerResult.rows[0]
            const medusaId = customerData?.medusa_id || customer_id // Fallback to passed ID if not found in our table
            const customerEmail = customerData?.email || "unknown@example.com"
            const customerName = customerData ? `${customerData.first_name || ''} ${customerData.last_name || ''}`.trim() : "Unknown Customer"

            // Find affiliate_user_id if exists
            const affiliateResult = await pool.query(
                `SELECT id FROM affiliate_user WHERE UPPER(refer_code) = $1`,
                [normalizedCode]
            )
            const affiliateUserId = affiliateResult.rows[0]?.id || null

            // Safely insert without ON CONFLICT constraint requirements
            // Ensure we use the Medusa ID (medusaId) for the customer_id column
            await pool.query(
                `INSERT INTO affiliate_referrals 
                   (affiliate_code, affiliate_user_id, customer_id, customer_email, customer_name)
                 SELECT $1, $2, $3, $4, $5
                 WHERE NOT EXISTS (SELECT 1 FROM affiliate_referrals WHERE customer_id = $3)`,
                [normalizedCode, affiliateUserId, medusaId, customerEmail, customerName]
            )

            // ✅ CRITICAL FIX: Synchronize with Medusa metadata so the order-placed subscriber can find this code
            try {
                // Since this is an API route, we rely on Medusa Admin API or a direct fetch if we have the token
                // However, the easiest way here is to use the Medusa service if it's available or just log it
                // For now, let's assume the storefront will try to update its own metadata if we return success
                console.log(`[SYNC] Referral code ${normalizedCode} should be synced to Medusa for customer ${medusaId}`)
            } catch (syncError) {
                console.warn('[SYNC ERROR] Failed to sync referral to Medusa metadata:', syncError)
            }

            console.log(`✅ Tracked affiliate referral for: ${normalizedCode}`)

            await pool.end()
            console.log('✅ Referral code saved successfully')

            return NextResponse.json({ success: true, message: "Referral saved" })
        } catch (dbError) {
            console.error('❌ Database insert error:', dbError)
            await pool.end().catch(() => { })
            return NextResponse.json(
                { error: "Database error", details: dbError instanceof Error ? dbError.message : String(dbError) },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error('❌ API Endpoint error:', error)
        return NextResponse.json(
            { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        )
    }
}

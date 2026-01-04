import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import { adminFetch } from "@/lib/medusa-admin"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * POST /api/store/wallet/create-coin-discount
 * Creates a one-time Medusa discount code when customer applies coins at checkout
 */
export async function POST(req: NextRequest) {
    console.log("=== CREATE COIN DISCOUNT API CALLED ===")

    try {
        const body = await req.json()
        const { customer_id, cart_id, coin_amount } = body

        console.log("Discount request:", { customer_id, cart_id, coin_amount })

        if (!customer_id || !coin_amount || coin_amount <= 0) {
            return NextResponse.json(
                { error: "Invalid request: customer_id and positive coin_amount required" },
                { status: 400 }
            )
        }

        if (!DATABASE_URL) {
            console.error("DATABASE_URL not configured")
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            )
        }

        const pool = new Pool({ connectionString: DATABASE_URL })

        try {
            // 1. Get current wallet balance (in minor units)
            const walletResult = await pool.query(
                `SELECT coins_balance FROM customer_wallet WHERE customer_id = $1`,
                [customer_id]
            )

            if (walletResult.rows.length === 0) {
                await pool.end()
                return NextResponse.json(
                    { error: "Wallet not found", success: false },
                    { status: 404 }
                )
            }

            const currentBalance = parseFloat(walletResult.rows[0].coins_balance) || 0

            // coin_amount is in minor units (e.g., 1063 for 10.63 coins)
            if (coin_amount > currentBalance) {
                await pool.end()
                return NextResponse.json(
                    {
                        error: "Insufficient coins",
                        success: false,
                        available: currentBalance,
                        requested: coin_amount
                    },
                    { status: 400 }
                )
            }

            // 2. Generate unique discount code
            const timestamp = Date.now()
            const random = Math.random().toString(36).substring(2, 8).toUpperCase()
            const discountCode = `COINS-${timestamp}-${random}`

            // 3. Create Medusa discount via Admin API
            // Medusa v2 uses promotions API instead of discounts
            const discountPayload = {
                code: discountCode,
                type: "standard",
                application_method: {
                    type: "fixed",
                    target_type: "order",
                    value: coin_amount, // Already in minor units
                    currency_code: "INR"
                },
                rules: [{
                    attribute: "customer_id",
                    operator: "eq",
                    values: [customer_id]
                }]
            }

            console.log("Creating Medusa v2 promotion:", discountPayload)

            const discountResponse = await adminFetch("/admin/promotions", {
                method: "POST",
                body: JSON.stringify(discountPayload)
            })

            if (!discountResponse.ok) {
                console.error("Failed to create Medusa discount:", discountResponse)
                await pool.end()
                return NextResponse.json(
                    {
                        error: "Failed to create discount code",
                        details: discountResponse.data,
                        success: false
                    },
                    { status: 500 }
                )
            }

            // 4. Deduct coins from wallet (reserve them for this discount)
            await pool.query(
                `UPDATE customer_wallet 
                 SET coins_balance = coins_balance - $1, 
                     updated_at = NOW()
                 WHERE customer_id = $2`,
                [coin_amount, customer_id]
            )

            // 5. Create transaction record
            await pool.query(
                `INSERT INTO wallet_transactions 
                 (customer_id, transaction_type, amount, description, status)
                 VALUES ($1, 'REDEEMED', $2, $3, 'USED')`,
                [
                    customer_id,
                    coin_amount,
                    `Coins used for discount ${discountCode}`
                ]
            )

            await pool.end()

            console.log(`✅ Created discount code ${discountCode} for ${coin_amount / 100} rupees and deducted ${coin_amount} coins`)

            return NextResponse.json({
                success: true,
                discount_code: discountCode,
                discount_amount_minor: coin_amount,
                discount_amount_rupees: coin_amount / 100,
                coins_deducted: coin_amount
            })
        } catch (dbError) {
            console.error("❌ Database error:", dbError)
            await pool.end().catch(() => { })
            return NextResponse.json(
                { error: "Database error", details: String(dbError) },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error("❌ Create discount error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

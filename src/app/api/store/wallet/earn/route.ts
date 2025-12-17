import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL
const COIN_EARNING_RATE = 0.01 // 1% of order total

/**
 * POST /api/store/wallet/earn
 * Awards coins after order completion (2% of order total)
 */
export async function POST(req: NextRequest) {
    console.log("=== WALLET EARN API CALLED ===")

    try {
        const body = await req.json()
        const { customer_id, order_id, order_total } = body

        console.log("Earn request:", { customer_id, order_id, order_total })

        if (!customer_id || !order_id || order_total === undefined) {
            return NextResponse.json(
                { error: "Missing required fields: customer_id, order_id, order_total" },
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
            // Calculate coins to award (2% of order total)
            const coinsEarned = parseFloat((order_total * COIN_EARNING_RATE).toFixed(2))

            // Expiry date is 1 year from now
            const expiryDate = new Date()
            expiryDate.setFullYear(expiryDate.getFullYear() + 1)

            // Check if coins already awarded for this order
            const existingResult = await pool.query(
                `SELECT id FROM wallet_transactions WHERE order_id = $1 AND transaction_type = 'EARNED'`,
                [order_id]
            )

            if (existingResult.rows.length > 0) {
                await pool.end()
                return NextResponse.json({
                    success: false,
                    message: "Coins already awarded for this order",
                    coins_earned: 0
                })
            }

            // Ensure wallet exists
            await pool.query(
                `INSERT INTO customer_wallet (customer_id, coins_balance)
         VALUES ($1, 0)
         ON CONFLICT (customer_id) DO NOTHING`,
                [customer_id]
            )

            // Add transaction record
            await pool.query(
                `INSERT INTO wallet_transactions 
         (customer_id, order_id, transaction_type, amount, description, expiry_date, status)
         VALUES ($1, $2, 'EARNED', $3, $4, $5, 'ACTIVE')`,
                [
                    customer_id,
                    order_id,
                    coinsEarned,
                    `1% cashback on order ${order_id}`,
                    expiryDate.toISOString()
                ]
            )

            // Update wallet balance
            await pool.query(
                `UPDATE customer_wallet 
         SET coins_balance = coins_balance + $1, updated_at = NOW()
         WHERE customer_id = $2`,
                [coinsEarned, customer_id]
            )

            // Get new balance
            const balanceResult = await pool.query(
                `SELECT coins_balance FROM customer_wallet WHERE customer_id = $1`,
                [customer_id]
            )
            const newBalance = parseFloat(balanceResult.rows[0]?.coins_balance) || 0

            await pool.end()

            console.log(`✅ Awarded ${coinsEarned} coins to ${customer_id}. New balance: ${newBalance}`)

            return NextResponse.json({
                success: true,
                coins_earned: coinsEarned,
                new_balance: newBalance,
                expiry_date: expiryDate.toISOString()
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
        console.error("❌ Wallet earn error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

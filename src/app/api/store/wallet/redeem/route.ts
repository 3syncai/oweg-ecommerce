import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * POST /api/store/wallet/redeem
 * Use coins as discount at checkout
 */
export async function POST(req: NextRequest) {
    console.log("=== WALLET REDEEM API CALLED ===")

    try {
        const body = await req.json()
        const { customer_id, order_id, amount } = body

        console.log("Redeem request:", { customer_id, order_id, amount })

        if (!customer_id || !amount || amount <= 0) {
            return NextResponse.json(
                { error: "Invalid request: customer_id and positive amount required" },
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
            // Get current balance
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

            if (amount > currentBalance) {
                await pool.end()
                return NextResponse.json(
                    {
                        error: "Insufficient coins",
                        success: false,
                        available: currentBalance,
                        requested: amount
                    },
                    { status: 400 }
                )
            }

            // Create redemption transaction
            await pool.query(
                `INSERT INTO wallet_transactions 
         (customer_id, order_id, transaction_type, amount, description, status)
         VALUES ($1, $2, 'REDEEMED', $3, $4, 'USED')`,
                [
                    customer_id,
                    order_id || null,
                    amount,
                    `Coins redeemed${order_id ? ` for order ${order_id}` : ''}`
                ]
            )

            // Deduct from wallet balance
            await pool.query(
                `UPDATE customer_wallet 
         SET coins_balance = coins_balance - $1, updated_at = NOW()
         WHERE customer_id = $2`,
                [amount, customer_id]
            )

            // Get new balance
            const newBalanceResult = await pool.query(
                `SELECT coins_balance FROM customer_wallet WHERE customer_id = $1`,
                [customer_id]
            )
            const newBalance = parseFloat(newBalanceResult.rows[0]?.coins_balance) || 0

            await pool.end()

            console.log(`✅ Redeemed ${amount} coins for ${customer_id}. New balance: ${newBalance}`)

            return NextResponse.json({
                success: true,
                coins_redeemed: amount,
                discount_amount: amount, // 1 coin = ₹1
                new_balance: newBalance
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
        console.error("❌ Wallet redeem error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

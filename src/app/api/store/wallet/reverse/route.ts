import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * POST /api/store/wallet/reverse
 * 
 * Reverse coin awards for cancelled/refunded orders.
 * This deducts coins that were previously earned for a specific order.
 * 
 * Body: { order_id: string }
 * 
 * Use cases:
 * - Order cancelled by admin
 * - Order refunded
 * - Payment failed/disputed
 */
export async function POST(req: NextRequest) {
    console.log("=== WALLET COIN REVERSAL ===")

    try {
        const body = await req.json()
        const { order_id, reason } = body as { order_id?: string; reason?: string }

        if (!order_id) {
            return NextResponse.json(
                { error: "order_id is required" },
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
            // Step 1: Find the EARNED transaction for this order
            const earnedResult = await pool.query(`
        SELECT id, customer_id, amount, status
        FROM wallet_transactions
        WHERE order_id = $1 
          AND transaction_type = 'EARNED'
          AND status = 'ACTIVE'
      `, [order_id])

            if (earnedResult.rows.length === 0) {
                console.log(`No active earned coins found for order ${order_id}`)
                await pool.end()
                return NextResponse.json({
                    success: true,
                    message: "No coins to reverse (order may not have earned coins or already reversed)",
                    reversed: false,
                    amount: 0
                })
            }

            const earnedTx = earnedResult.rows[0]
            const customerId = earnedTx.customer_id
            const amount = parseFloat(earnedTx.amount)

            console.log(`Reversing ${amount} coins for customer ${customerId}, order ${order_id}`)

            // Step 2: Mark the original EARNED transaction as REVERSED
            await pool.query(`
        UPDATE wallet_transactions
        SET status = 'REVERSED'
        WHERE id = $1
      `, [earnedTx.id])

            // Step 3: Create a REVERSAL transaction record
            await pool.query(`
        INSERT INTO wallet_transactions 
        (customer_id, order_id, transaction_type, amount, description, status)
        VALUES ($1, $2, 'REVERSAL', $3, $4, 'COMPLETED')
      `, [
                customerId,
                order_id,
                -amount, // Negative amount for reversal
                reason || `Coins reversed - order cancelled/refunded`
            ])

            // Step 4: Deduct from wallet balance
            await pool.query(`
        UPDATE customer_wallet
        SET coins_balance = GREATEST(0, coins_balance - $1),
            updated_at = NOW()
        WHERE customer_id = $2
      `, [amount, customerId])

            // Step 5: Get new balance
            const balanceResult = await pool.query(`
        SELECT coins_balance FROM customer_wallet WHERE customer_id = $1
      `, [customerId])

            const newBalance = balanceResult.rows[0]?.coins_balance || 0

            await pool.end()

            console.log(`✅ Reversed ${amount} coins for customer ${customerId}. New balance: ${newBalance}`)

            return NextResponse.json({
                success: true,
                message: `Reversed ${amount} coins for order ${order_id}`,
                reversed: true,
                amount: amount,
                new_balance: newBalance,
                customer_id: customerId
            })
        } catch (dbErr) {
            console.error("Database error in coin reversal:", dbErr)
            await pool.end().catch(() => { })
            return NextResponse.json(
                { error: "Database error", details: String(dbErr) },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error("Coin reversal error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

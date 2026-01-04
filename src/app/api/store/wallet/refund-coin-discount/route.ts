import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * POST /api/store/wallet/refund-coin-discount
 * Refunds coins if payment was canceled/failed after discount was applied
 */
export async function POST(req: NextRequest) {
    console.log("=== REFUND COIN DISCOUNT API CALLED ===")

    try {
        const body = await req.json()
        const { customer_id, discount_code } = body

        console.log("Refund request:", { customer_id, discount_code })

        if (!customer_id || !discount_code) {
            return NextResponse.json(
                { error: "customer_id and discount_code required" },
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
            // 1. Find the original REDEEMED transaction for this discount code
            const transactionResult = await pool.query(
                `SELECT id, amount FROM wallet_transactions 
                 WHERE customer_id = $1 
                 AND description LIKE $2 
                 AND transaction_type = 'REDEEMED' 
                 AND status = 'USED'
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [customer_id, `%${discount_code}%`]
            )

            if (transactionResult.rows.length === 0) {
                await pool.end()
                return NextResponse.json(
                    { success: true, message: "No coins to refund" },
                    { status: 200 }
                )
            }

            const originalTransaction = transactionResult.rows[0]
            const refundAmount = parseFloat(originalTransaction.amount)

            // 2. Add coins back to wallet
            await pool.query(
                `UPDATE customer_wallet 
                 SET coins_balance = coins_balance + $1, 
                     updated_at = NOW()
                 WHERE customer_id = $2`,
                [refundAmount, customer_id]
            )

            // 3. Create REFUND transaction
            await pool.query(
                `INSERT INTO wallet_transactions 
                 (customer_id, transaction_type, amount, description, status)
                 VALUES ($1, 'REFUND', $2, $3, 'COMPLETED')`,
                [
                    customer_id,
                    refundAmount,
                    `Refund for canceled discount ${discount_code}`
                ]
            )

            // 4. Mark original transaction as REFUNDED
            await pool.query(
                `UPDATE wallet_transactions 
                 SET status = 'REFUNDED' 
                 WHERE id = $1`,
                [originalTransaction.id]
            )

            await pool.end()

            console.log(`✅ Refunded ${refundAmount} coins to customer ${customer_id}`)

            return NextResponse.json({
                success: true,
                refunded_amount: refundAmount,
                message: "Coins refunded successfully"
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
        console.error("❌ Refund error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

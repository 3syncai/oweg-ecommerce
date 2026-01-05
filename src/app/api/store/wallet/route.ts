import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * GET /api/store/wallet
 * Returns customer's wallet balance, expiring coins, and recent transactions
 */
export async function GET(req: NextRequest) {
    try {
        const customerId = req.headers.get("x-customer-id")

        if (!customerId) {
            return NextResponse.json(
                { balance: 0, expiring_soon: 0, transactions: [] },
                { status: 200 }
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
            // Get or create wallet
            let walletResult = await pool.query(
                `SELECT coins_balance FROM customer_wallet WHERE customer_id = $1`,
                [customerId]
            )

            let balance = 0
            if (walletResult.rows.length === 0) {
                // Create wallet if doesn't exist
                await pool.query(
                    `INSERT INTO customer_wallet (customer_id, coins_balance) VALUES ($1, 0)`,
                    [customerId]
                )
            } else {
                balance = (parseFloat(walletResult.rows[0].coins_balance) || 0) / 100
            }

            // Get coins expiring in next 30 days
            const expiringResult = await pool.query(
                `SELECT COALESCE(SUM(amount), 0) as expiring_soon
         FROM wallet_transactions
         WHERE customer_id = $1
           AND transaction_type = 'EARNED'
           AND status = 'ACTIVE'
           AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'`,
                [customerId]
            )
            const expiring_soon = (parseFloat(expiringResult.rows[0]?.expiring_soon) || 0) / 100

            // Get pending coins (waiting for delivery to activate)
            const pendingResult = await pool.query(
                `SELECT COALESCE(SUM(amount), 0) as pending_coins
         FROM wallet_transactions
         WHERE customer_id = $1
           AND transaction_type = 'EARNED'
           AND status = 'PENDING'`,
                [customerId]
            )
            const pending_coins = (parseFloat(pendingResult.rows[0]?.pending_coins) || 0) / 100

            // Get locked coins (ACTIVE but unlock_at is in the future - 5min delay after delivery)
            const lockedResult = await pool.query(
                `SELECT COALESCE(SUM(amount), 0) as locked_coins,
                        MIN((metadata->>'unlock_at')::timestamp) as next_unlock
         FROM wallet_transactions
         WHERE customer_id = $1
           AND transaction_type = 'EARNED'
           AND status = 'ACTIVE'
           AND metadata->>'unlock_at' IS NOT NULL
           AND (metadata->>'unlock_at')::timestamp > NOW()`,
                [customerId]
            )
            const locked_coins = (parseFloat(lockedResult.rows[0]?.locked_coins) || 0) / 100
            const next_unlock = lockedResult.rows[0]?.next_unlock || null

            // Calculate usable balance (total balance minus locked coins)
            const usable_balance = Math.max(0, balance - locked_coins)

            // Get recent transactions (last 50)
            const transactionsResult = await pool.query(
                `SELECT id, order_id, transaction_type, amount, description, expiry_date, status, metadata, created_at
         FROM wallet_transactions
         WHERE customer_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
                [customerId]
            )

            await pool.end()

            return NextResponse.json({
                balance: usable_balance,  // Only return usable (unlocked) balance
                total_balance: balance,   // Full balance including locked
                locked_coins,             // Coins waiting to unlock (5min after delivery)
                pending_coins,            // Coins waiting for delivery
                expiring_soon,
                next_unlock,              // When next coins will unlock
                transactions: transactionsResult.rows.map((t: any) => ({
                    ...t,
                    amount: (parseFloat(t.amount) || 0) / 100
                }))
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
        console.error("Wallet API error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const DATABASE_URL = process.env.DATABASE_URL

/**
 * POST /api/cron/expire-coins
 * 
 * Cron job endpoint to expire old coins (1 year from earned date)
 * Call this daily via:
 * - Vercel Cron (vercel.json)
 * - External cron service (cron-job.org, etc.)
 * - Or manually for testing
 * 
 * Security: Use CRON_SECRET to prevent unauthorized access
 */
export async function POST(req: NextRequest) {
    console.log("=== COIN EXPIRY CRON JOB STARTED ===")

    try {
        // Optional: Verify cron secret for security
        const authHeader = req.headers.get("authorization")
        const cronSecret = process.env.CRON_SECRET

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            console.warn("Unauthorized cron request")
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
            // Step 1: Find all ACTIVE earned coins that have expired (expiry_date < NOW)
            const expiredCoinsResult = await pool.query(`
        SELECT id, customer_id, amount, expiry_date
        FROM wallet_transactions
        WHERE status = 'ACTIVE'
          AND transaction_type = 'EARNED'
          AND expiry_date < NOW()
      `)

            const expiredCoins = expiredCoinsResult.rows
            console.log(`Found ${expiredCoins.length} expired coin transactions`)

            if (expiredCoins.length === 0) {
                await pool.end()
                return NextResponse.json({
                    success: true,
                    message: "No expired coins found",
                    expired_count: 0,
                    affected_customers: 0
                })
            }

            // Step 2: Group by customer_id and calculate total expired per customer
            const customerExpiredMap: Record<string, number> = {}
            for (const coin of expiredCoins) {
                const customerId = coin.customer_id
                const amount = parseFloat(coin.amount) || 0
                customerExpiredMap[customerId] = (customerExpiredMap[customerId] || 0) + amount
            }

            // Step 3: Mark expired coins as 'EXPIRED'
            const expiredIds = expiredCoins.map(c => c.id)
            await pool.query(`
        UPDATE wallet_transactions
        SET status = 'EXPIRED'
        WHERE id = ANY($1)
      `, [expiredIds])

            console.log(`Marked ${expiredIds.length} transactions as EXPIRED`)

            // Step 4: Deduct from each customer's wallet balance
            let affectedCustomers = 0
            for (const [customerId, expiredAmount] of Object.entries(customerExpiredMap)) {
                await pool.query(`
          UPDATE customer_wallet
          SET coins_balance = GREATEST(0, coins_balance - $1),
              updated_at = NOW()
          WHERE customer_id = $2
        `, [expiredAmount, customerId])

                console.log(`Deducted ${expiredAmount} coins from customer ${customerId}`)
                affectedCustomers++
            }

            // Step 5: Log the expiry action (optional: create EXPIRED transaction record)
            const totalExpired = Object.values(customerExpiredMap).reduce((a, b) => a + b, 0)

            await pool.end()

            console.log(`=== COIN EXPIRY COMPLETE: ${totalExpired} coins from ${affectedCustomers} customers ===`)

            return NextResponse.json({
                success: true,
                message: "Expired coins processed successfully",
                expired_count: expiredCoins.length,
                total_coins_expired: totalExpired,
                affected_customers: affectedCustomers
            })
        } catch (dbErr) {
            console.error("Database error in expiry cron:", dbErr)
            await pool.end().catch(() => { })
            return NextResponse.json(
                { error: "Database error", details: String(dbErr) },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error("Coin expiry cron error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

// Also allow GET for easy testing
export async function GET(req: NextRequest) {
    return POST(req)
}

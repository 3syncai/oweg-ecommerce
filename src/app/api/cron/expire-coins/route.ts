import { NextRequest, NextResponse } from "next/server"
import { applyExpiry, expireEarnedCoins } from "@/lib/wallet-ledger"

export const dynamic = "force-dynamic"

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

        try {
            const expiredCoins = await expireEarnedCoins({ limit: 1000 })
            console.log(`Found ${expiredCoins.length} expired earn entries`)

            if (expiredCoins.length === 0) {
                return NextResponse.json({
                    success: true,
                    message: "No expired coins found",
                    expired_count: 0,
                    affected_customers: 0
                })
            }

            const affectedCustomerIds = new Set<string>()
            let affectedCustomers = 0
            let totalExpired = 0
            for (const coin of expiredCoins) {
                const amountMinor = Math.abs(Number(coin.amount) || 0)
                if (amountMinor <= 0) continue
                const result = await applyExpiry({
                    earnId: coin.id,
                    customerId: coin.customer_id,
                    amountMinor
                })
                if (result.applied) {
                    totalExpired += amountMinor
                    if (!affectedCustomerIds.has(coin.customer_id)) {
                        affectedCustomerIds.add(coin.customer_id)
                        affectedCustomers += 1
                    }
                }
            }

            console.log(`=== COIN EXPIRY COMPLETE: ${totalExpired} minor units from ${affectedCustomers} customers ===`)

            return NextResponse.json({
                success: true,
                message: "Expired coins processed successfully",
                expired_count: expiredCoins.length,
                total_coins_expired: totalExpired / 100,
                affected_customers: affectedCustomers
            })
        } catch (dbErr) {
            console.error("Database error in expiry cron:", dbErr)
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

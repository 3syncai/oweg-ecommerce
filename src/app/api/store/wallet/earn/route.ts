import { NextRequest, NextResponse } from "next/server"
import { earnCoins } from "@/lib/wallet-ledger"
import { requireWalletMutationAuth } from "@/lib/wallet-mutation-auth"

export const dynamic = "force-dynamic"

const COIN_EARNING_RATE = 0.01 // 1% of order total

/**
 * POST /api/store/wallet/earn
 * Awards coins after order completion (ledger-based).
 */
export async function POST(req: NextRequest) {
    console.log("=== WALLET EARN API CALLED ===")

    try {
        const { auth, errorResponse } = await requireWalletMutationAuth(req)
        if (errorResponse) return errorResponse

        const body = await req.json()
        const { order_id, order_total } = body
        const customer_id = auth.internal
            ? (typeof body.customer_id === "string" ? body.customer_id.trim() : "")
            : auth.customerId

        console.log("Earn request:", { customer_id, order_id, order_total })

        if (!customer_id || !order_id || order_total === undefined) {
            return NextResponse.json(
                { error: "Missing required fields: customer_id, order_id, order_total" },
                { status: 400 }
            )
        }

        const coinsEarnedRupees = parseFloat((order_total * COIN_EARNING_RATE).toFixed(2))
        const coinsEarnedMinor = Math.round(coinsEarnedRupees * 100)

        const expiryDate = new Date()
        expiryDate.setFullYear(expiryDate.getFullYear() + 1)

        const result = await earnCoins({
            customerId: customer_id,
            orderId: order_id,
            amountMinor: coinsEarnedMinor,
            expiresAt: expiryDate.toISOString(),
            metadata: { reason: "earn" }
        })

        return NextResponse.json({
            success: result.applied,
            coins_earned: coinsEarnedRupees,
            new_actual_balance: (result.actual_balance || 0) / 100,
            expiry_date: expiryDate.toISOString()
        })
    } catch (error) {
        console.error("Wallet earn error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

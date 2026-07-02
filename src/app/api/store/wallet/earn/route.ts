import { NextRequest, NextResponse } from "next/server"
import { earnCoins } from "@/lib/wallet-ledger"
import { requireInternalWalletMutationAuth } from "@/lib/wallet-mutation-auth"
import { resolveOrderEarnContext } from "@/lib/wallet-order-auth"

export const dynamic = "force-dynamic"

const COIN_EARNING_RATE = 0.01 // 1% of order total

/**
 * POST /api/store/wallet/earn
 * Awards coins after order completion (ledger-based).
 * Internal callers only — order total is resolved from the database.
 */
export async function POST(req: NextRequest) {
    console.log("=== WALLET EARN API CALLED ===")

    try {
        const { errorResponse } = await requireInternalWalletMutationAuth(req)
        if (errorResponse) return errorResponse

        const body = await req.json()
        const order_id = typeof body.order_id === "string" ? body.order_id.trim() : ""

        if (!order_id) {
            return NextResponse.json(
                { error: "Missing required field: order_id" },
                { status: 400 }
            )
        }

        const earnContext = await resolveOrderEarnContext(order_id)
        if (!earnContext) {
            return NextResponse.json(
                { error: "Unable to resolve order for earn" },
                { status: 400 }
            )
        }

        const { customerId, orderTotalRupees } = earnContext

        const coinsEarnedRupees = parseFloat((orderTotalRupees * COIN_EARNING_RATE).toFixed(2))
        const coinsEarnedMinor = Math.round(coinsEarnedRupees * 100)

        const expiryDate = new Date()
        expiryDate.setFullYear(expiryDate.getFullYear() + 1)

        const result = await earnCoins({
            customerId,
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

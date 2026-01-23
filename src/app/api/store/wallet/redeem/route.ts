import { NextRequest, NextResponse } from "next/server"
import { spendCoins } from "@/lib/wallet-ledger"

export const dynamic = "force-dynamic"

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

        const amountMinor = Math.round(amount * 100)

        try {
            const result = await spendCoins({
                customerId: customer_id,
                orderId: order_id || null,
                amountMinor,
                idempotencyKey: order_id ? `spend:${order_id}` : null,
                metadata: { reason: "redeem" }
            })

            return NextResponse.json({
                success: result.applied,
                coins_redeemed: amountMinor / 100,
                discount_amount: amountMinor / 100,
                new_actual_balance: (result.actual_balance || 0) / 100
            })
        } catch (err) {
            const code = (err as Error & { code?: string }).code
            if (code === "NEGATIVE_BALANCE") {
                return NextResponse.json(
                    { error: "Wallet has pending adjustments. Redemption is disabled until balance is settled." },
                    { status: 400 }
                )
            }
            if (code === "INSUFFICIENT_BALANCE") {
                return NextResponse.json(
                    { error: "Insufficient coins" },
                    { status: 400 }
                )
            }
            console.error("Wallet redeem error:", err)
            return NextResponse.json(
                { error: "Internal server error" },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error("Wallet redeem error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

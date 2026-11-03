import { NextRequest, NextResponse } from "next/server"
import { spendCoins } from "@/lib/wallet-ledger"
import { requireWalletMutationAuth } from "@/lib/wallet-mutation-auth"
import { checkRateLimit, clientIpFromRequest } from "@/lib/simple-rate-limit"

export const dynamic = "force-dynamic"

/**
 * POST /api/store/wallet/redeem
 * Use coins as discount at checkout
 */
export async function POST(req: NextRequest) {
    console.log("=== WALLET REDEEM API CALLED ===")

    try {
        const { auth, errorResponse } = await requireWalletMutationAuth(req)
        if (errorResponse) return errorResponse

        const rateKey = `wallet-redeem:${auth.customerId || clientIpFromRequest(req)}`
        const limited = checkRateLimit({ key: rateKey, limit: 20, windowMs: 60_000 })
        if (!limited.allowed) {
            return NextResponse.json(
                { error: "Too many redeem attempts. Try again shortly." },
                { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
            )
        }

        const body = await req.json()
        const { order_id, amount } = body
        const customer_id = auth.internal
            ? (typeof body.customer_id === "string" ? body.customer_id.trim() : "")
            : auth.customerId

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

import { NextRequest, NextResponse } from "next/server"
import { creditAdjustment, findSpendByReference } from "@/lib/wallet-ledger"

export const dynamic = "force-dynamic"

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

        try {
            const spend = await findSpendByReference({
                customerId: customer_id,
                referenceId: discount_code
            })

            if (!spend) {
                return NextResponse.json(
                    { success: true, message: "No coins to refund" },
                    { status: 200 }
                )
            }

            await creditAdjustment({
                customerId: customer_id,
                referenceId: `refund:${discount_code}`,
                idempotencyKey: `refund:${discount_code}`,
                amountMinor: spend.amountMinor,
                reason: `Refund for canceled discount ${discount_code}`,
                metadata: { discount_code }
            })

            return NextResponse.json({
                success: true,
                refunded_amount: spend.amountMinor / 100,
                message: "Coins refunded successfully"
            })
        } catch (err) {
            console.error("Refund error:", err)
            return NextResponse.json(
                { error: "Database error", details: String(err) },
                { status: 500 }
            )
        }
    } catch (error) {
        console.error("Refund error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

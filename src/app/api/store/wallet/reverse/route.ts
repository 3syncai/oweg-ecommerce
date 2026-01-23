import { NextRequest, NextResponse } from "next/server"
import { reverseEarned } from "@/lib/wallet-ledger"

export const dynamic = "force-dynamic"

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

        const result = await reverseEarned({
            orderId: order_id,
            reason: reason || `Coins reversed - order cancelled/refunded`
        })

        if (!result.applied) {
            return NextResponse.json({
                success: true,
                message: "No coins to reverse (order may not have earned coins or already reversed)",
                reversed: false,
                amount: 0
            })
        }

        return NextResponse.json({
            success: true,
            message: `Reversed coins for order ${order_id}`,
            reversed: true,
            amount: null,
            new_actual_balance: (result.actual_balance || 0) / 100,
            customer_id: result.customerId
        })
    } catch (error) {
        console.error("Coin reversal error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

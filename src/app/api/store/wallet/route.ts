import { NextRequest, NextResponse } from "next/server"
import { getWalletSnapshot } from "@/lib/wallet-ledger"

export const dynamic = "force-dynamic"

/**
 * GET /api/store/wallet
 * Returns customer's wallet balance, expiring coins, and recent transactions
 */
export async function GET(req: NextRequest) {
    try {
        const customerId = req.headers.get("x-customer-id")

        if (!customerId) {
            return NextResponse.json(
                {
                    balance: 0,
                    display_balance: 0,
                    actual_balance: 0,
                    pending_adjustment: 0,
                    adjustment_message: null,
                    can_redeem: false,
                    expiring_soon: 0,
                    pending_coins: 0,
                    locked_coins: 0,
                    next_unlock: null,
                    transactions: []
                },
                { status: 200 }
            )
        }

        const snapshot = await getWalletSnapshot({ customerId })
        const actualBalance = snapshot.actual_balance_minor / 100
        const displayBalance = snapshot.display_balance_minor / 100
        const pendingAdjustment = snapshot.pending_adjustment_minor / 100

        return NextResponse.json({
            balance: displayBalance,
            display_balance: displayBalance,
            actual_balance: actualBalance,
            pending_adjustment: pendingAdjustment,
            adjustment_message: pendingAdjustment > 0
                ? `${pendingAdjustment.toFixed(0)} coins pending adjustment due to a returned order.`
                : null,
            can_redeem: actualBalance >= 0 && displayBalance > 0,
            expiring_soon: 0,
            pending_coins: 0,
            locked_coins: 0,
            next_unlock: null,
            transactions: snapshot.transactions.map((t: any) => ({
                ...t,
                amount: (parseFloat(t.amount) || 0) / 100,
                status: t.status || "COMPLETED"
            }))
        })
    } catch (error) {
        console.error("Wallet API error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

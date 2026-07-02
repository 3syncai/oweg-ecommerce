import { NextRequest, NextResponse } from "next/server"
import { creditAdjustment, findSpendByReference, findSpendByReferenceAny } from "@/lib/wallet-ledger"
import { requireInternalWalletMutationAuth } from "@/lib/wallet-mutation-auth"

export const dynamic = "force-dynamic"

/**
 * POST /api/store/wallet/refund-coin-discount
 * Refunds coins if payment was canceled/failed after discount was applied.
 * Internal callers only.
 */
export async function POST(req: NextRequest) {
    console.log("=== REFUND COIN DISCOUNT API CALLED ===")

    try {
        const { errorResponse } = await requireInternalWalletMutationAuth(req)
        if (errorResponse) return errorResponse

        const body = await req.json()
        const { discount_code } = body

        console.log("Refund request:", { discount_code })

        if (!discount_code) {
            return NextResponse.json(
                { error: "discount_code required" },
                { status: 400 }
            )
        }

        try {
            const customerId =
                typeof body.customer_id === "string" ? body.customer_id.trim() : ""

            const spend = customerId
                ? await findSpendByReference({
                    customerId,
                    referenceId: discount_code
                })
                : await findSpendByReferenceAny({
                    referenceId: discount_code
                })

            if (!spend) {
                return NextResponse.json(
                    { success: true, message: "No coins to refund" },
                    { status: 200 }
                )
            }

            const resolvedCustomerId =
                customerId ||
                ("customerId" in spend && typeof spend.customerId === "string"
                    ? spend.customerId
                    : undefined);

            if (!resolvedCustomerId) {
                return NextResponse.json(
                    { error: "Unable to resolve customer for refund" },
                    { status: 400 }
                );
            }

            await creditAdjustment({
                customerId: resolvedCustomerId,
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
                { error: "Database error" },
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

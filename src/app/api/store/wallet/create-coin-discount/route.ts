import { NextRequest, NextResponse } from "next/server"
import { adminFetch } from "@/lib/medusa-admin"
import { spendCoins, creditAdjustment } from "@/lib/wallet-ledger"

export const dynamic = "force-dynamic"

/**
 * POST /api/store/wallet/create-coin-discount
 * Creates a one-time Medusa discount code when customer applies coins at checkout
 */
export async function POST(req: NextRequest) {
    console.log("=== CREATE COIN DISCOUNT API CALLED ===")

    try {
        const body = await req.json()
        const { customer_id, cart_id, coin_amount } = body

        console.log("Discount request:", { customer_id, cart_id, coin_amount })

        if (!customer_id || !coin_amount || coin_amount <= 0) {
            return NextResponse.json(
                { error: "Invalid request: customer_id and positive coin_amount required" },
                { status: 400 }
            )
        }

        // 1. Generate unique discount code
        const timestamp = Date.now()
        const random = Math.random().toString(36).substring(2, 8).toUpperCase()
        const discountCode = `COINS-${timestamp}-${random}`

        // 2. Deduct coins via ledger (idempotent) BEFORE creating promotion
        try {
            await spendCoins({
                customerId: customer_id,
                amountMinor: coin_amount,
                referenceId: discountCode,
                idempotencyKey: `spend:${discountCode}`,
                metadata: {
                    cart_id: cart_id || null,
                    discount_code: discountCode,
                    reason: "coin_discount"
                }
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
            throw err
        }

        // 3. Create Medusa promotion only after coins are spent
        const discountPayload = {
            code: discountCode,
            type: "standard",
            application_method: {
                type: "fixed",
                target_type: "order",
                value: coin_amount, // minor units
                currency_code: "INR"
            },
            rules: [{
                attribute: "customer_id",
                operator: "eq",
                values: [customer_id]
            }]
        }

        console.log("Creating Medusa v2 promotion:", discountPayload)

        const discountResponse = await adminFetch("/admin/promotions", {
            method: "POST",
            body: JSON.stringify(discountPayload)
        })

        if (!discountResponse.ok) {
            console.error("Failed to create Medusa discount:", discountResponse)
            try {
                await creditAdjustment({
                    customerId: customer_id,
                    referenceId: `refund:${discountCode}`,
                    idempotencyKey: `refund:${discountCode}`,
                    amountMinor: coin_amount,
                    reason: "promotion_create_failed",
                    metadata: { discount_code: discountCode }
                })
            } catch (refundErr) {
                console.error("Failed to refund coins after promotion error:", refundErr)
            }
            return NextResponse.json(
                {
                    error: "Failed to create discount code",
                    success: false
                },
                { status: 500 }
            )
        }

        console.log(`Created discount code ${discountCode} for ${coin_amount / 100} rupees`)

        return NextResponse.json({
            success: true,
            discount_code: discountCode,
            discount_amount_minor: coin_amount,
            discount_amount_rupees: coin_amount / 100,
            coins_deducted: coin_amount
        })
    } catch (error) {
        console.error("Create discount error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

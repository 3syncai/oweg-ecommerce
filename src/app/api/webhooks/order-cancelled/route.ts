import { NextRequest, NextResponse } from "next/server"
import { getOrderById } from "@/lib/medusa-admin"
import { creditAdjustment } from "@/lib/wallet-ledger"

export const dynamic = "force-dynamic"

/**
 * POST /api/webhooks/order-cancelled
 * 
 * Webhook endpoint for Medusa to call when an order is cancelled or refunded.
 * This triggers the coin reversal process.
 * 
 * Expected payload from Medusa:
 * {
 *   "event": "order.cancelled" | "order.refunded" | "order.return_approved",
 *   "data": {
 *     "id": "order_123",
 *     "customer_id": "cus_123",
 *     "status": "cancelled" | "refunded" | "return_approved"
 *   }
 * }
 * 
 * Security: Can add WEBHOOK_SECRET verification
 */
export async function POST(req: NextRequest) {
    console.log("=== ORDER CANCELLATION WEBHOOK ===")

    try {
        // Optional: Verify webhook secret
        const webhookSecret = process.env.MEDUSA_WEBHOOK_SECRET
        const authHeader = req.headers.get("x-webhook-secret")

        if (webhookSecret && authHeader !== webhookSecret) {
            console.warn("Invalid webhook secret")
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await req.json()
        console.log("Webhook payload:", JSON.stringify(body, null, 2))

        const event = body.event || body.type
        const data = body.data || body.payload || body

        // Extract order ID
        const orderId = data.id || data.order_id

        if (!orderId) {
            console.error("No order ID in webhook payload")
            return NextResponse.json(
                { error: "Missing order_id in payload" },
                { status: 400 }
            )
        }

        // Check if this is a cancellation/refund event
        const isCancellation =
            event === "order.cancelled" ||
            event === "order.canceled" ||
            event === "order.refunded" ||
            event === "order.refund_created" ||
            event === "order.return_approved" ||
            data.status === "cancelled" ||
            data.status === "canceled" ||
            data.status === "refunded" ||
            data.status === "return_approved"

        if (!isCancellation) {
            console.log(`Ignoring event: ${event}, status: ${data.status}`)
            return NextResponse.json({
                success: true,
                message: "Event ignored (not a cancellation/refund)"
            })
        }

        // Call the coin reversal endpoint (earned coins)
        const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL ||
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

        const reverseRes = await fetch(`${baseUrl}/api/store/wallet/reverse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                order_id: orderId,
                reason: `Order ${event || "cancelled/refunded"}`
            })
        })

        const reverseData = await reverseRes.json()
        let refundData: unknown = null

        // If coins were spent on this order, refund them back to the wallet
        try {
            const orderRes = await getOrderById(orderId)
            const orderPayload = orderRes?.data as Record<string, unknown> | null
            const order =
                (orderPayload && typeof orderPayload === "object" && "order" in orderPayload
                    ? (orderPayload as Record<string, unknown>).order
                    : orderPayload) as Record<string, unknown> | null

            const customerId =
                (order && typeof order === "object" && (order as Record<string, unknown>).customer_id) ||
                (data && typeof data === "object" && (data as Record<string, unknown>).customer_id)

            const metadata =
                order && typeof order === "object"
                    ? ((order as Record<string, unknown>).metadata as Record<string, unknown> | undefined)
                    : undefined

            const discountCode =
                (metadata?.coin_discount_code as string | undefined) ||
                (metadata?.coin_discount as string | undefined) ||
                (metadata?.coin_discount_id as string | undefined)

            const coinsDiscounted =
                typeof metadata?.coins_discountend === "number"
                    ? metadata.coins_discountend
                    : typeof metadata?.coin_discount_rupees === "number"
                        ? metadata.coin_discount_rupees
                        : typeof metadata?.coin_discount_minor === "number"
                            ? metadata.coin_discount_minor / 100
                            : 0

            if (customerId && discountCode) {
                const refundRes = await fetch(`${baseUrl}/api/store/wallet/refund-coin-discount`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        customer_id: customerId,
                        discount_code: discountCode
                    })
                })
                refundData = await refundRes.json()
            } else if (customerId && coinsDiscounted > 0) {
                const amountMinor = Math.round(coinsDiscounted * 100)
                await creditAdjustment({
                    customerId: String(customerId),
                    referenceId: `refund-order:${orderId}`,
                    idempotencyKey: `refund-order:${orderId}`,
                    amountMinor,
                    reason: `Refund coins for order ${orderId}`,
                    metadata: {
                        order_id: orderId,
                        coins_discountend: coinsDiscounted
                    }
                })
                refundData = {
                    success: true,
                    refunded_amount: amountMinor / 100,
                    message: "Coins refunded via order metadata"
                }
            }
        } catch (err) {
            console.error("Coin discount refund error:", err)
        }

        console.log("Coin reversal result:", reverseData)

        return NextResponse.json({
            success: true,
            event: event,
            order_id: orderId,
            coin_reversal: reverseData,
            coin_discount_refund: refundData
        })
    } catch (error) {
        console.error("Order cancellation webhook error:", error)
        return NextResponse.json(
            { error: "Internal server error", details: String(error) },
            { status: 500 }
        )
    }
}

// Also support GET for testing
export async function GET(_req: NextRequest) {
    return NextResponse.json({
        status: "ok",
        endpoint: "/api/webhooks/order-cancelled",
        description: "Webhook for order cancellation/refund to reverse earned coins",
        expected_payload: {
            event: "order.cancelled | order.refunded | order.return_approved",
            data: {
                id: "order_123"
            }
        }
    })
}

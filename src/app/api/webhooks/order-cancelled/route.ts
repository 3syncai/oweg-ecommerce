import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * POST /api/webhooks/order-cancelled
 * 
 * Webhook endpoint for Medusa to call when an order is cancelled or refunded.
 * This triggers the coin reversal process.
 * 
 * Expected payload from Medusa:
 * {
 *   "event": "order.cancelled" | "order.refunded",
 *   "data": {
 *     "id": "order_123",
 *     "customer_id": "cus_123",
 *     "status": "cancelled" | "refunded"
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
            data.status === "cancelled" ||
            data.status === "canceled" ||
            data.status === "refunded"

        if (!isCancellation) {
            console.log(`Ignoring event: ${event}, status: ${data.status}`)
            return NextResponse.json({
                success: true,
                message: "Event ignored (not a cancellation/refund)"
            })
        }

        // Call the coin reversal endpoint
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
            process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
            "http://localhost:3000"

        const reverseRes = await fetch(`${baseUrl}/api/store/wallet/reverse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                order_id: orderId,
                reason: `Order ${event || "cancelled/refunded"}`
            })
        })

        const reverseData = await reverseRes.json()

        console.log("Coin reversal result:", reverseData)

        return NextResponse.json({
            success: true,
            event: event,
            order_id: orderId,
            coin_reversal: reverseData
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
            event: "order.cancelled | order.refunded",
            data: {
                id: "order_123"
            }
        }
    })
}

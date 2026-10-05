import { NextRequest, NextResponse } from "next/server"
import { settleOrderCancellationWallet } from "@/lib/order-cancel-wallet-settlement"
import { verifyMedusaWebhookSecret } from "@/lib/medusa-webhook-auth"
import { getPool } from "@/lib/wallet-ledger"
import { reverseVendorEarningsForOrder } from "@/lib/vendor-earnings"

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
        const webhookAuthError = verifyMedusaWebhookSecret(req)
        if (webhookAuthError) return webhookAuthError

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

        const wallet = await settleOrderCancellationWallet({
            orderId,
            event: String(event || "order.cancelled"),
            reason: `Order ${event || "cancelled/refunded"}`,
        })
        console.log("Coin reversal result:", wallet.earned_reverse)

        let vendorEarningsReversal: Awaited<ReturnType<typeof reverseVendorEarningsForOrder>> | null = null
        try {
            const pool = getPool()
            vendorEarningsReversal = await reverseVendorEarningsForOrder(
                orderId,
                pool,
                event === "order.return_approved" ? "return" : "cancelled"
            )
            console.log("[vendor-earnings] reversal:", vendorEarningsReversal)
        } catch (err) {
            console.error("[vendor-earnings] reversal failed:", err)
        }

        return NextResponse.json({
            success: true,
            event: event,
            order_id: orderId,
            coin_reversal: wallet.earned_reverse,
            coin_discount_refund: wallet.spend_refund,
            customer_affiliate: wallet.customer_affiliate,
            vendor_earnings: vendorEarningsReversal
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

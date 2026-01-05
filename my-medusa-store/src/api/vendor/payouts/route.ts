import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * Vendor Payouts API
 * GET /vendor/payouts - List payouts for the logged-in vendor
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    try {
        // Get vendor ID from authenticated session
        const vendorUser = (req as any).vendor || (req as any).user

        if (!vendorUser?.vendor_id) {
            res.status(401).json({ message: "Unauthorized: No vendor session found" })
            return
        }

        const vendor_id = vendorUser.vendor_id

        const query = req.scope.resolve("query")

        const { data: payouts } = await query.graph({
            entity: "vendor_payout",
            fields: [
                "id",
                "amount",
                "commission_amount",
                "net_amount",
                "commission_rate",
                "currency_code",
                "transaction_id",
                "payment_method",
                "status",
                "notes",
                "order_ids",
                "created_at",
            ],
            filters: {
                vendor_id: vendor_id,
            },
            pagination: {
                skip: 0,
                take: 100, // Limit to 100 most recent
            },
        })

        // Calculate totals
        const totals = payouts.reduce(
            (acc: any, payout: any) => {
                if (payout.status === "processed") {
                    acc.total_credited += payout.net_amount || 0
                    acc.total_commission += payout.commission_amount || 0
                    acc.total_gross += payout.amount || 0
                }
                return acc
            },
            { total_credited: 0, total_commission: 0, total_gross: 0 }
        )

        res.json({
            payouts,
            totals,
            count: payouts.length,
        })
    } catch (error: any) {
        console.error("Vendor payouts fetch error:", error)
        res.status(500).json({
            message: "Failed to fetch payouts",
            error: error?.message || "Unknown error",
        })
    }
}

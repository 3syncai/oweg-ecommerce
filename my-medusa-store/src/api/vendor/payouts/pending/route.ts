import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../../../../modules/vendor"

/**
 * Get pending payout summary for logged-in vendor
 * GET /vendor/payouts/pending
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

        // Get vendor details for commission rate
        const vendorModuleService = req.scope.resolve(VENDOR_MODULE)
        const [vendor] = await vendorModuleService.listVendors({ id: vendor_id })

        if (!vendor) {
            res.status(404).json({ message: "Vendor not found" })
            return
        }

        const commission_rate = vendor.commission_rate || 2.0

        // Get order module
        const orderModuleService = req.scope.resolve(Modules.ORDER)

        // Fetch all orders for this vendor
        const allOrders = await orderModuleService.listOrders({
            metadata: {
                vendor_id: vendor_id,
            },
        })

        // Filter completed orders (no date restriction for testing)
        const eligibleOrders = allOrders.filter((order: any) => {
            const isFulfilled =
                order.fulfillment_status === 'shipped' ||
                order.fulfillment_status === 'delivered'
            return isFulfilled
        })

        // Get existing paid orders
        const query = req.scope.resolve("query")
        const { data: existingPayouts } = await query.graph({
            entity: "vendor_payout",
            fields: ["order_ids"],
            filters: {
                vendor_id: vendor_id,
                status: "processed",
            },
        })

        const paidOrderIds = new Set<string>()
        existingPayouts.forEach((payout: any) => {
            if (payout.order_ids && Array.isArray(payout.order_ids)) {
                payout.order_ids.forEach((id: string) => paidOrderIds.add(id))
            }
        })

        // Filter unpaid orders
        const unpaidOrders = eligibleOrders.filter(
            (order: any) => !paidOrderIds.has(order.id)
        )

        // Calculate pending amounts
        const pending_gross = unpaidOrders.reduce(
            (sum: number, order: any) => sum + (order.total || 0),
            0
        )

        const pending_commission = (pending_gross * commission_rate) / 100
        const pending_net = pending_gross - pending_commission

        res.json({
            pending: {
                gross_amount: pending_gross,
                commission_amount: pending_commission,
                net_amount: pending_net,
                order_count: unpaidOrders.length,
                commission_rate,
            },
        })
    } catch (error: any) {
        console.error("Pending payout calculation error:", error)
        res.status(500).json({
            message: "Failed to calculate pending payout",
            error: error?.message || "Unknown error",
        })
    }
}

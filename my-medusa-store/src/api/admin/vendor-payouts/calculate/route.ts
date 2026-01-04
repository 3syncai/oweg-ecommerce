import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../../../../modules/vendor"

/**
 * Calculate pending payout for a vendor
 * POST /admin/vendor-payouts/calculate
 * Body: { vendor_id: string }
 */
export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    try {
        const { vendor_id } = req.body as { vendor_id: string }

        if (!vendor_id) {
            res.status(400).json({ message: "vendor_id is required" })
            return
        }

        // Get vendor details using the vendor module
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

        // Filter orders: Completed/Delivered (fulfillment_status)
        // NOTE: Changed to 0 days for testing - remove date check
        const eligibleOrders = allOrders.filter((order: any) => {
            const isFulfilled =
                order.fulfillment_status === 'shipped' ||
                order.fulfillment_status === 'delivered'
            return isFulfilled // No date check - all completed orders eligible
        })

        // TODO: Check existing payouts to exclude already paid orders
        // For now, calculate on all eligible orders
        const unpaidOrders = eligibleOrders

        // Calculate totals
        const gross_amount = unpaidOrders.reduce(
            (sum: number, order: any) => sum + (order.total || 0),
            0
        )

        const commission = (gross_amount * commission_rate) / 100
        const net_amount = gross_amount - commission

        res.json({
            success: true,
            calculation: {
                vendor_id,
                vendor_name: vendor.store_name || vendor.name,
                commission_rate,
                gross_amount,
                commission_amount: commission,
                net_amount,
                order_count: unpaidOrders.length,
                orders: unpaidOrders.map((order: any) => ({
                    id: order.id,
                    display_id: order.display_id,
                    total: order.total,
                    created_at: order.created_at,
                    fulfillment_status: order.fulfillment_status,
                })),
            },
        })
    } catch (error: any) {
        console.error("Calculate payout error:", error)
        res.status(500).json({
            message: "Failed to calculate payout",
            error: error?.message || "Unknown error",
        })
    }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import type VendorModuleService from "../../../../modules/vendor/service"
import { Modules } from "@medusajs/framework/utils"

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
        const vendorModuleService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
        const [vendor] = await vendorModuleService.listVendors({ id: vendor_id })

        if (!vendor) {
            res.status(404).json({ message: "Vendor not found" })
            return
        }

        const commission_rate = vendor.commission_rate || 2.0

        // Get query service
        const query = req.scope.resolve("query")

        // Get all products for this vendor
        const { data: vendorProducts } = await query.graph({
            entity: "product",
            fields: ["id", "title", "variants.*"],
            filters: {
                metadata: {
                    vendor_id: vendor_id
                }
            }
        })

        if (!vendorProducts || vendorProducts.length === 0) {
            res.json({
                vendor_id,
                vendor_name: vendor.store_name || vendor.name,
                commission_rate,
                total_revenue: 0,
                commission: 0,
                net_amount: 0,
                order_count: 0,
                order_ids: [],
            })
            return
        }

        // Extract all variant IDs for this vendor
        const variantIds: string[] = []
        vendorProducts.forEach((product: any) => {
            product.variants?.forEach((variant: any) => {
                variantIds.push(variant.id)
            })
        })

        if (variantIds.length === 0) {
            res.json({
                vendor_id,
                vendor_name: vendor.store_name || vendor.name,
                commission_rate,
                total_revenue: 0,
                commission: 0,
                net_amount: 0,
                order_count: 0,
                order_ids: [],
            })
            return
        }

        // Get all orders with line items and fulfillments
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "display_id", "items.*", "fulfillments.*"]
        })

        // Calculate revenue from matching items
        let total_revenue = 0
        const vendor_order_ids: string[] = []
        const processedOrders = new Set<string>()

        orders?.forEach((order: any) => {
            // Check if order is delivered by looking at fulfillments
            const hasDeliveredFulfillment = order.fulfillments?.some((f: any) =>
                f.delivered_at !== null && f.delivered_at !== undefined
            )
            const hasShippedFulfillment = order.fulfillments?.some((f: any) =>
                f.shipped_at !== null && f.shipped_at !== undefined
            )
            const isDelivered = hasDeliveredFulfillment || hasShippedFulfillment

            if (!isDelivered) return

            let orderHasVendorItem = false
            let orderRevenue = 0

            order.items?.forEach((item: any) => {
                const itemVariantId = item.variant_id
                const matchesVendor = variantIds.includes(itemVariantId)

                if (matchesVendor) {
                    orderHasVendorItem = true
                    const itemRevenue = (item.unit_price || 0) * (item.quantity || 1)
                    orderRevenue += itemRevenue
                }
            })

            if (orderHasVendorItem && !processedOrders.has(order.id)) {
                processedOrders.add(order.id)
                vendor_order_ids.push(order.id)
                total_revenue += orderRevenue
            }
        })

        const commission = (total_revenue * commission_rate) / 100
        const net_amount = total_revenue - commission

        res.json({
            vendor_id,
            vendor_name: vendor.store_name || vendor.name,
            commission_rate,
            total_revenue,
            commission,
            net_amount,
            order_count: vendor_order_ids.length,
            order_ids: vendor_order_ids,
        })
    } catch (error: any) {
        console.error("Calculate payout error:", error)
        res.status(500).json({
            message: "Failed to calculate payout",
            error: error?.message || "Unknown error",
        })
    }
}

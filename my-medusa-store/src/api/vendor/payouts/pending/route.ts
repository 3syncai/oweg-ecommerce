import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import VendorModuleService from "../../../../modules/vendor/service"
import { getVendorEarningsSummary } from "../../../../lib/vendor-earnings"

/**
 * Get pending payout summary for logged-in vendor
 * GET /vendor/payouts/pending
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    try {
        const vendorUser = (req as any).vendor || (req as any).user

        if (!vendorUser?.vendor_id) {
            res.status(401).json({ message: "Unauthorized: No vendor session found" })
            return
        }

        const vendor_id = vendorUser.vendor_id

        const vendorModuleService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
        const [vendor] = await vendorModuleService.listVendors({ id: vendor_id })

        if (!vendor) {
            res.status(404).json({ message: "Vendor not found" })
            return
        }

        const commission_rate = vendor.commission_rate || 2.0
        const pool = new Pool({ connectionString: process.env.DATABASE_URL })

        try {
            const summary = await getVendorEarningsSummary(vendor_id, pool)

            res.json({
                pending: {
                    gross_amount: summary.available_balance + summary.unlocking_balance,
                    commission_amount:
                        (summary.available_balance + summary.unlocking_balance) *
                        (commission_rate / 100),
                    net_amount: summary.available_balance,
                    unlocking_amount: summary.unlocking_balance,
                    order_count: summary.unlocking.length + summary.credited_recent.length,
                    commission_rate,
                },
                summary,
            })
        } finally {
            await pool.end().catch(() => {})
        }
    } catch (error: any) {
        console.error("Pending payout calculation error:", error)
        res.status(500).json({
            message: "Failed to calculate pending payout",
            error: error?.message || "Unknown error",
        })
    }
}

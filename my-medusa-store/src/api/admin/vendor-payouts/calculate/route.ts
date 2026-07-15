import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import VendorModuleService from "../../../../modules/vendor/service"
import { getVendorPayableSnapshot } from "../../../../lib/vendor-earnings"

/**
 * Calculate payable amount for a vendor from vendor_earnings_log.
 * Only CREDITED (timer finished) rows are payable — UNLOCKING stays pending.
 *
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

    const vendorModuleService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
    const [vendor] = await vendorModuleService.listVendors({ id: vendor_id })

    if (!vendor) {
      res.status(404).json({ message: "Vendor not found" })
      return
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL })

    try {
      const snapshot = await getVendorPayableSnapshot(vendor_id, pool)
      const commission_rate = snapshot.commission_rate || vendor.commission_rate || 2.0

      res.json({
        vendor_id,
        vendor_name: vendor.store_name || vendor.name,
        commission_rate,
        total_revenue: snapshot.total_revenue,
        commission: snapshot.commission,
        net_amount: snapshot.net_amount,
        order_count: snapshot.order_count,
        order_ids: snapshot.order_ids,
        available_balance: snapshot.available_balance,
        unlocking_balance: snapshot.unlocking_balance,
        unlocking_count: snapshot.unlocking_count,
        unlock_minutes: 5,
        note:
          snapshot.unlocking_count > 0
            ? `${snapshot.unlocking_count} order(s) still in 5-min unlock — not payable yet`
            : undefined,
      })
    } finally {
      await pool.end().catch(() => {})
    }
  } catch (error: any) {
    console.error("Calculate payout error:", error)
    res.status(500).json({
      message: "Failed to calculate payout",
      error: error?.message || "Unknown error",
    })
  }
}

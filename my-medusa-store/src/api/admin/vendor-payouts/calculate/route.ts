import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import VendorModuleService from "../../../../modules/vendor/service"
import { getVendorPayableSnapshot } from "../../../../lib/vendor-earnings"
import {
  getVendorCommissionDefaultRate,
  resolveVendorCommissionRate,
} from "../../../../lib/vendor-commission"

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
      const globalDefault = await getVendorCommissionDefaultRate(pool)
      const resolved = resolveVendorCommissionRate(
        {
          commission_override: (vendor as { commission_override?: boolean }).commission_override === true,
          commission_rate: vendor.commission_rate,
        },
        globalDefault
      )
      // Apply current policy on unpaid gross — earnings rows may still have an older rate (e.g. 0%).
      const snapshot = await getVendorPayableSnapshot(vendor_id, pool, {
        effectiveRate: resolved.rate,
      })

      // Keep unpaid CREDITED rows in sync with the rate we will actually deduct on pay.
      if (snapshot.order_ids.length > 0) {
        await pool.query(
          `
            UPDATE vendor_earnings_log
            SET
              commission_rate = $2,
              commission_amount = ROUND((gross_amount::numeric * $2::numeric) / 100, 2),
              net_amount = ROUND(gross_amount::numeric - (gross_amount::numeric * $2::numeric) / 100, 2),
              updated_at = NOW()
            WHERE vendor_id = $1
              AND status = 'CREDITED'
              AND order_id = ANY($3::text[])
          `,
          [vendor_id, resolved.rate, snapshot.order_ids]
        )
      }

      res.json({
        vendor_id,
        vendor_name: vendor.store_name || vendor.name,
        commission_rate: resolved.rate,
        commission_source: resolved.source,
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

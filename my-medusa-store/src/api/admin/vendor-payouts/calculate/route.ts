import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import VendorModuleService from "../../../../modules/vendor/service"
import { getVendorPayableSnapshot, repairClaimCreditsWithoutCommission } from "../../../../lib/vendor-earnings"
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

      // Keep unpaid CREDITED *order* rows in sync with the commission rate we will deduct on pay.
      // Claim credits (order_id claim:*) are full admin-approved amounts — never take commission.
      const payableOrderIds = snapshot.order_ids.filter(
        (id) => !String(id).startsWith("claim:")
      )
      if (payableOrderIds.length > 0) {
        await pool.query(
          `
            UPDATE vendor_earnings_log
            SET
              commission_rate = $2,
              commission_amount = ROUND(
                (COALESCE(NULLIF(taxable_amount, 0), gross_amount)::numeric * $2::numeric) / 100,
                2
              ),
              net_amount = ROUND(
                GREATEST(
                  0,
                  COALESCE(NULLIF(taxable_amount, 0), gross_amount)::numeric
                    - ROUND(
                      (COALESCE(NULLIF(taxable_amount, 0), gross_amount)::numeric * $2::numeric) / 100,
                      2
                    )
                    - COALESCE(tcs_amount, 0)
                    - COALESCE(tds_amount, 0)
                    - COALESCE(logistic_fee, 0)
                    - COALESCE(return_fee, 0)
                ),
                2
              ),
              updated_at = NOW()
            WHERE vendor_id = $1
              AND status = 'CREDITED'
              AND order_id = ANY($3::text[])
              AND order_id NOT LIKE 'claim:%'
          `,
          [vendor_id, resolved.rate, payableOrderIds]
        )
      }

      // Repair any claim rows that previously had commission wrongly applied
      await repairClaimCreditsWithoutCommission(vendor_id, pool)

      const refreshed = await getVendorPayableSnapshot(vendor_id, pool, {
        effectiveRate: resolved.rate,
      })

      res.json({
        vendor_id,
        vendor_name: vendor.store_name || vendor.name,
        commission_rate: resolved.rate,
        commission_source: resolved.source,
        total_revenue: refreshed.total_revenue,
        commission: refreshed.commission,
        tcs: refreshed.tcs,
        tds: refreshed.tds,
        logistic_fee: refreshed.logistic_fee,
        net_amount: refreshed.net_amount,
        order_count: refreshed.order_count,
        order_ids: refreshed.order_ids,
        line_items: refreshed.line_items,
        available_balance: refreshed.available_balance,
        unlocking_balance: refreshed.unlocking_balance,
        unlocking_count: refreshed.unlocking_count,
        unlock_minutes: 5,
        note:
          refreshed.unlocking_count > 0
            ? `${refreshed.unlocking_count} order(s) still in 5-min unlock — not payable yet`
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

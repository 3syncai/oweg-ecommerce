import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../../_lib/guards"
import {
  formatVendorOrder,
  getVendorOrderOrRespond,
  setVendorOrderCorsHeaders,
} from "../../../../lib/vendor-order-workflow"
import { fetchVendorCommissionRate } from "../../../../lib/vendor-earnings"
import { getMarketplaceTaxRates } from "../../../../lib/vendor-marketplace-tax"

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  try {
    const result = await getVendorOrderOrRespond(req, res, auth.vendor_id, orderId)
    if (!result) return

    let settlementRates: {
      commission_rate: number
      tcs_rate: number
      tds_rate: number
    } | null = null
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const [commission_rate, taxRates] = await Promise.all([
        fetchVendorCommissionRate(auth.vendor_id, pool),
        getMarketplaceTaxRates(pool),
      ])
      settlementRates = {
        commission_rate,
        tcs_rate: taxRates.tcs_rate,
        tds_rate: taxRates.tds_rate,
      }
    } catch (rateErr) {
      console.warn("[Vendor order detail] settlement rates unavailable:", rateErr)
    } finally {
      await pool.end().catch(() => {})
    }

    return res.json({
      order: formatVendorOrder(
        result.order,
        auth.vendor_id,
        result.vendorProductIds,
        settlementRates
      ),
    })
  } catch (error: any) {
    console.error("Vendor order detail error:", error)
    return res.status(500).json({ message: error?.message || "Failed to load order" })
  }
}

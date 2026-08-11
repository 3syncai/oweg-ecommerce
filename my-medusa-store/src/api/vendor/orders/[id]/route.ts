import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../../_lib/guards"
import {
  formatVendorOrder,
  getVendorOrderOrRespond,
  setVendorOrderCorsHeaders,
  enrichOrdersWithProductGstMetadata,
  type VendorOrderSettlementRates,
} from "../../../../lib/vendor-order-workflow"
import { fetchVendorCommissionRate } from "../../../../lib/vendor-earnings"
import {
  DEFAULT_MARKETPLACE_TCS_RATE,
  DEFAULT_MARKETPLACE_TDS_RATE,
  getMarketplaceTaxRates,
} from "../../../../lib/vendor-marketplace-tax"

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

async function loadSettlementRates(
  pool: Pool,
  vendorId: string
): Promise<VendorOrderSettlementRates> {
  try {
    const [commission_rate, taxRates] = await Promise.all([
      fetchVendorCommissionRate(vendorId, pool),
      getMarketplaceTaxRates(pool),
    ])
    return {
      commission_rate: Number(commission_rate) || 0,
      tcs_rate: taxRates.tcs_rate,
      tds_rate: taxRates.tds_rate,
    }
  } catch (rateErr) {
    console.warn("[Vendor order detail] settlement rates unavailable, using defaults:", rateErr)
    return {
      commission_rate: 0,
      tcs_rate: DEFAULT_MARKETPLACE_TCS_RATE,
      tds_rate: DEFAULT_MARKETPLACE_TDS_RATE,
    }
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const result = await getVendorOrderOrRespond(req, res, auth.vendor_id, orderId)
    if (!result) return

    const settlementRates = await loadSettlementRates(pool, auth.vendor_id)
    try {
      await enrichOrdersWithProductGstMetadata(pool, [result.order])
    } catch (gstErr) {
      console.warn("[Vendor order detail] product GST enrich failed:", gstErr)
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
  } finally {
    await pool.end().catch(() => {})
  }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../../../_lib/guards"
import {
  formatVendorOrder,
  getVendorOrderOrRespond,
  getVendorWorkflow,
  setVendorOrderCorsHeaders,
  enrichOrdersWithProductGstMetadata,
  type VendorOrderSettlementRates,
} from "../../../../../lib/vendor-order-workflow"
import { syncVendorShipmentTracking } from "../../../../../lib/vendor-shipment-tracking-sync"
import { fetchVendorCommissionRate } from "../../../../../lib/vendor-earnings"
import {
  DEFAULT_MARKETPLACE_TCS_RATE,
  DEFAULT_MARKETPLACE_TDS_RATE,
  getMarketplaceTaxRates,
} from "../../../../../lib/vendor-marketplace-tax"

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
  } catch {
    return {
      commission_rate: 0,
      tcs_rate: DEFAULT_MARKETPLACE_TCS_RATE,
      tds_rate: DEFAULT_MARKETPLACE_TDS_RATE,
    }
  }
}

/**
 * GET /vendor/orders/:id/track
 * Amazon-style: pull carrier status and auto-advance In Transit / Delivered.
 */
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
      console.warn("[Vendor order track] product GST enrich failed:", gstErr)
    }

    const workflow = getVendorWorkflow(result.order.metadata, auth.vendor_id)
    if (!workflow.shipping_method) {
      return res.json({
        order: formatVendorOrder(
          result.order,
          auth.vendor_id,
          result.vendorProductIds,
          settlementRates
        ),
        tracking: {
          provider: "none",
          status: "not_shipped",
          error: "No shipping method selected yet",
          checkpoints: [],
        },
      })
    }

    const synced = await syncVendorShipmentTracking({
      container: req.scope,
      order: result.order,
      vendorId: auth.vendor_id,
      vendorProductIds: result.vendorProductIds,
      ensureShippedOnMovement: true,
    })

    const order = {
      ...result.order,
      metadata: synced.metadata || result.order.metadata,
    }

    return res.json({
      order: formatVendorOrder(order, auth.vendor_id, result.vendorProductIds, settlementRates),
      tracking: synced.tracking,
    })
  } catch (error: any) {
    console.error("Vendor order tracking error:", error)
    return res.status(500).json({ message: error?.message || "Failed to track order" })
  } finally {
    await pool.end().catch(() => {})
  }
}

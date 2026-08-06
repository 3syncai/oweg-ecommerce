import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import { filterVendorVisibleOrders } from "../../../lib/vendor-order-visibility"
import { findVendorOrderIds } from "../../../lib/vendor-order-ids"
import { getSharedDbPool } from "../../../lib/db-pool"
import {
  formatVendorOrder,
  getVendorProductIds,
  setVendorOrderCorsHeaders,
  type VendorOrderStage,
} from "../../../lib/vendor-order-workflow"
import { fetchVendorCommissionRate } from "../../../lib/vendor-earnings"
import { getMarketplaceTaxRates } from "../../../lib/vendor-marketplace-tax"

const EMPTY_COUNTS: Record<VendorOrderStage | "total", number> = {
  total: 0,
  to_accept: 0,
  to_pack: 0,
  to_dispatch: 0,
  in_transit: 0,
  delivered: 0,
}

const LIST_FIELDS = [
  "id",
  "display_id",
  "email",
  "status",
  "is_draft_order",
  "metadata",
  "summary",
  "currency_code",
  "created_at",
  "updated_at",
  "customer_id",
  "shipping_address.*",
  "billing_address.*",
  "items.id",
  "items.title",
  "items.variant_title",
  "items.quantity",
  "items.detail.quantity",
  "items.unit_price",
  "items.product_id",
  "items.metadata",
  "items.variant.product_id",
  "items.variant_sku",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
]

/** Lighter payload for badge / counts-only polling */
const COUNT_FIELDS = [
  "id",
  "status",
  "is_draft_order",
  "metadata",
  "created_at",
  "updated_at",
  "items.id",
  "items.product_id",
  "items.variant.product_id",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
]

function emptyCountsResponse() {
  return { orders: [], counts: { ...EMPTY_COUNTS } }
}

function buildCounts(formattedOrders: any[]) {
  return formattedOrders.reduce(
    (acc: Record<VendorOrderStage | "total", number>, order: any) => {
      acc.total += 1
      const stage = order.vendor_stage as VendorOrderStage
      if (stage in acc) acc[stage] += 1
      return acc
    },
    { ...EMPTY_COUNTS }
  )
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const countsOnly =
    String(req.query?.counts_only || "").toLowerCase() === "1" ||
    String(req.query?.counts_only || "").toLowerCase() === "true"

  const started = Date.now()

  try {
    const query = req.scope.resolve("query")
    const pool = getSharedDbPool()
    const vendorProductIds = await getVendorProductIds(req, auth.vendor_id)
    if (vendorProductIds.length === 0) {
      return res.json(emptyCountsResponse())
    }

    const productIdSet = new Set(vendorProductIds)
    const orderIds = await findVendorOrderIds(pool, auth.vendor_id, vendorProductIds)
    if (orderIds.length === 0) {
      return res.json(emptyCountsResponse())
    }

    const { data: ordersData } = await query.graph({
      entity: "order",
      fields: countsOnly ? COUNT_FIELDS : LIST_FIELDS,
      filters: { id: orderIds },
    })

    const vendorOrders = filterVendorVisibleOrders(
      (ordersData || []).filter((order: any) => {
        const items = order.items || []
        return items.some((item: any) => {
          const productId = item.product_id || item.variant?.product_id
          return productId && productIdSet.has(productId)
        })
      })
    )

    let settlementRates: {
      commission_rate: number
      tcs_rate: number
      tds_rate: number
    } | null = null

    if (!countsOnly) {
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
        console.warn("[Orders API] settlement rates unavailable:", rateErr)
      }
    }

    const formattedOrders = vendorOrders.map((order: any) =>
      formatVendorOrder(
        order,
        auth.vendor_id,
        vendorProductIds,
        countsOnly ? null : settlementRates
      )
    )

    const counts = buildCounts(formattedOrders)
    console.log(
      `[Orders API] vendor=${auth.vendor_id} scoped=${orderIds.length} visible=${formattedOrders.length} counts_only=${countsOnly} ${Date.now() - started}ms`
    )

    if (countsOnly) {
      return res.json({ orders: [], counts })
    }

    return res.json({ orders: formattedOrders, counts })
  } catch (error: any) {
    console.error("Vendor orders list error:", error)
    return res.status(500).json({ message: error?.message || "Failed to list orders" })
  }
}

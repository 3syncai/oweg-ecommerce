import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import { filterVendorVisibleOrders } from "../../../lib/vendor-order-visibility"
import { findVendorOrderIds } from "../../../lib/vendor-order-ids"
import { getSharedDbPool } from "../../../lib/db-pool"
import {
  parseVendorPagination,
  slicePage,
  paginationMeta,
} from "../../../lib/vendor-pagination"
import {
  formatVendorOrder,
  getVendorProductIds,
  setVendorOrderCorsHeaders,
  enrichOrdersWithProductGstMetadata,
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
  "items.variant.product.metadata",
  "items.variant_sku",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
]

const COUNT_FIELDS = [
  "id",
  "display_id",
  "email",
  "status",
  "is_draft_order",
  "metadata",
  "created_at",
  "updated_at",
  "items.id",
  "items.title",
  "items.product_id",
  "items.variant.product_id",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
]

function emptyCountsResponse(pagination?: { all: boolean; limit: number; offset: number }) {
  return {
    orders: [],
    counts: { ...EMPTY_COUNTS },
    ...(pagination
      ? paginationMeta(0, pagination)
      : { count: 0, limit: 0, offset: 0 }),
  }
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
  const stageFilter = String(req.query?.stage || "").trim().toLowerCase()
  const q = String(req.query?.q || "").trim().toLowerCase()
  const pagination = parseVendorPagination(req, 10)
  const started = Date.now()

  try {
    const query = req.scope.resolve("query")
    const pool = getSharedDbPool()
    const vendorProductIds = await getVendorProductIds(req, auth.vendor_id)
    if (vendorProductIds.length === 0) {
      return res.json(emptyCountsResponse(pagination))
    }

    const productIdSet = new Set(vendorProductIds)
    const orderIds = await findVendorOrderIds(pool, auth.vendor_id, vendorProductIds)
    if (orderIds.length === 0) {
      return res.json(emptyCountsResponse(pagination))
    }

    // Light pass for stage counts + filtering
    const { data: lightOrders } = await query.graph({
      entity: "order",
      fields: COUNT_FIELDS,
      filters: { id: orderIds },
    })

    const visibleLight = filterVendorVisibleOrders(
      (lightOrders || []).filter((order: any) => {
        const items = order.items || []
        return items.some((item: any) => {
          const productId = item.product_id || item.variant?.product_id
          return productId && productIdSet.has(productId)
        })
      })
    )

    const lightFormatted = visibleLight.map((order: any) =>
      formatVendorOrder(order, auth.vendor_id, vendorProductIds, null)
    )
    const counts = buildCounts(lightFormatted)

    if (countsOnly) {
      console.log(
        `[Orders API] vendor=${auth.vendor_id} counts_only visible=${lightFormatted.length} ${Date.now() - started}ms`
      )
      return res.json({
        orders: [],
        counts,
        ...paginationMeta(0, pagination),
      })
    }

    let filtered = lightFormatted
    if (stageFilter && stageFilter !== "total" && stageFilter !== "all") {
      filtered = filtered.filter(
        (o: any) => String(o.vendor_stage || "").toLowerCase() === stageFilter
      )
    }
    if (q) {
      filtered = filtered.filter((order: any) => {
        const hay = [
          order.id,
          order.display_id,
          order.email,
          ...(order.product_names || []),
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" ")
        return hay.includes(q)
      })
    }

    filtered.sort(
      (a: any, b: any) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )

    const total = filtered.length
    const pageLight = slicePage(filtered, pagination)
    const pageIds = pageLight.map((o: any) => o.id)

    if (!pageIds.length) {
      return res.json({
        orders: [],
        counts,
        ...paginationMeta(total, pagination),
      })
    }

    // Full payload only for the current page
    const { data: pageOrdersData } = await query.graph({
      entity: "order",
      fields: LIST_FIELDS,
      filters: { id: pageIds },
    })

    let settlementRates: {
      commission_rate: number
      tcs_rate: number
      tds_rate: number
    } | null = null
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

    try {
      await enrichOrdersWithProductGstMetadata(pool, pageOrdersData || [])
    } catch (gstErr) {
      console.warn("[Orders API] product GST enrich failed:", gstErr)
    }

    const byId = new Map(
      (pageOrdersData || []).map((order: any) => [
        order.id,
        formatVendorOrder(order, auth.vendor_id, vendorProductIds, settlementRates),
      ])
    )
    const pageOrders = pageIds.map((id) => byId.get(id)).filter(Boolean)

    console.log(
      `[Orders API] vendor=${auth.vendor_id} scoped=${orderIds.length} total=${total} page=${pageOrders.length} ${Date.now() - started}ms`
    )

    return res.json({
      orders: pageOrders,
      counts,
      ...paginationMeta(total, pagination),
    })
  } catch (error: any) {
    console.error("Vendor orders list error:", error)
    return res.status(500).json({ message: error?.message || "Failed to list orders" })
  }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import { filterVendorVisibleOrders } from "../../../lib/vendor-order-visibility"
import {
  formatVendorOrder,
  getVendorProductIds,
  setVendorOrderCorsHeaders,
  type VendorOrderStage,
} from "../../../lib/vendor-order-workflow"

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    console.log(`[Orders API] Starting for vendor: ${auth.vendor_id}`)
    const query = req.scope.resolve("query")

    const vendorProductIds = await getVendorProductIds(req, auth.vendor_id)
    if (vendorProductIds.length === 0) {
      console.log(`[Orders API] No products found for vendor ${auth.vendor_id}`)
      return res.json({ orders: [] })
    }

    console.log(`[Orders API] Found ${vendorProductIds.length} vendor products`)

    // Get orders with items efficiently using query module
    const { data: ordersData } = await query.graph({
      entity: "order",
      fields: [
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
        "items.unit_price",
        "items.product_id",
        "items.variant.product_id",
        "items.variant_sku",
        "fulfillments.id",
        "fulfillments.shipped_at",
        "fulfillments.delivered_at",
        "fulfillments.canceled_at"
      ],
      filters: {}
    })

    console.log(`[Orders API] Total orders in system: ${ordersData?.length || 0}`)

    // Filter orders that contain vendor's products and exclude draft/unpaid checkouts
    const vendorOrders = filterVendorVisibleOrders(
      (ordersData || []).filter((order: any) => {
        const items = order.items || []
        return items.some((item: any) => {
          const productId = item.product_id || item.variant?.product_id
          return productId && vendorProductIds.includes(productId)
        })
      })
    )

    // Debug: Log first order structure to see actual data
    if (vendorOrders.length > 0) {
      console.log(`[Orders API] Sample order structure:`, JSON.stringify(vendorOrders[0], null, 2))
    }

    const formattedOrders = vendorOrders.map((order: any) =>
      formatVendorOrder(order, auth.vendor_id, vendorProductIds)
    )

    const counts = formattedOrders.reduce(
      (acc: Record<VendorOrderStage | "total", number>, order: any) => {
        acc.total += 1
        acc[order.vendor_stage as VendorOrderStage] += 1
        return acc
      },
      {
        total: 0,
        to_accept: 0,
        to_pack: 0,
        to_dispatch: 0,
        in_transit: 0,
        delivered: 0,
      }
    )

    console.log(`[Orders API] Returning ${formattedOrders.length} orders`)
    return res.json({ orders: formattedOrders, counts })
  } catch (error: any) {
    console.error("Vendor orders list error:", error)
    return res.status(500).json({ message: error?.message || "Failed to list orders" })
  }
}


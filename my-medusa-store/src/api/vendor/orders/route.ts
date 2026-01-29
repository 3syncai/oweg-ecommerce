import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import { Modules } from "@medusajs/framework/utils"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.VENDOR_CORS || 'http://localhost:4000')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    console.log(`[Orders API] Starting for vendor: ${auth.vendor_id}`)
    const query = req.scope.resolve("query")

    // Use query module to efficiently get vendor's product IDs with metadata filter
    const { data: vendorProducts } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: {
        metadata: {
          vendor_id: auth.vendor_id
        }
      }
    })

    if (!vendorProducts || vendorProducts.length === 0) {
      console.log(`[Orders API] No products found for vendor ${auth.vendor_id}`)
      return res.json({ orders: [] })
    }

    const vendorProductIds = vendorProducts.map((p: any) => p.id)
    console.log(`[Orders API] Found ${vendorProductIds.length} vendor products`)

    // Get orders with items efficiently using query module
    const { data: ordersData } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "status",
        "summary",
        "currency_code",
        "created_at",
        "items.id",
        "items.title",
        "items.variant_title",
        "items.quantity",
        "items.unit_price",
        "items.product_id",
        "items.variant.product_id",
        "fulfillments.id",
        "fulfillments.shipped_at",
        "fulfillments.delivered_at",
        "fulfillments.canceled_at"
      ],
      filters: {}
    })

    console.log(`[Orders API] Total orders in system: ${ordersData?.length || 0}`)

    // Filter orders that contain vendor's products
    const vendorOrders = (ordersData || []).filter((order: any) => {
      const items = order.items || []
      return items.some((item: any) => {
        const productId = item.product_id || item.variant?.product_id
        return productId && vendorProductIds.includes(productId)
      })
    })

    // Debug: Log first order structure to see actual data
    if (vendorOrders.length > 0) {
      console.log(`[Orders API] Sample order structure:`, JSON.stringify(vendorOrders[0], null, 2))
    }

    // Format orders with proper total
    const formattedOrders = vendorOrders.map((order: any) => {
      // Calculate fulfillment status
      let fulfillmentStatus = 'pending'
      const fulfillments = order.fulfillments || []

      if (fulfillments.length > 0) {
        if (fulfillments.some((f: any) => f.delivered_at)) {
          fulfillmentStatus = 'delivered'
        }
        else if (fulfillments.some((f: any) => f.shipped_at && !f.canceled_at)) {
          fulfillmentStatus = 'shipped'
        }
        else if (fulfillments.every((f: any) => f.canceled_at)) {
          fulfillmentStatus = 'canceled'
        }
        else {
          fulfillmentStatus = 'processing'
        }
      }

      return {
        ...order,
        total: order.summary?.current_order_total || 0,
        fulfillment_status: fulfillmentStatus
      }
    })

    console.log(`[Orders API] Returning ${formattedOrders.length} orders`)
    return res.json({ orders: formattedOrders })
  } catch (error: any) {
    console.error("Vendor orders list error:", error)
    return res.status(500).json({ message: error?.message || "Failed to list orders" })
  }
}


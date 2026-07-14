import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import ReturnModuleService from "../../../modules/returns/service"
import { RETURN_MODULE } from "../../../modules/returns"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.VENDOR_CORS || "http://localhost:4000"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

/**
 * GET /vendor/returns
 * Lists return/replacement requests that include this vendor's products.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const query = req.scope.resolve("query")
    const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)

    const { data: vendorProducts } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: {
        metadata: {
          vendor_id: auth.vendor_id,
        },
      },
    })

    if (!vendorProducts?.length) {
      return res.json({ return_requests: [] })
    }

    const vendorProductIds = new Set(vendorProducts.map((p: any) => p.id))
    const requests = await returnService.listReturnRequests({})

    if (!requests?.length) {
      return res.json({ return_requests: [] })
    }

    const orderIds = Array.from(
      new Set(requests.map((r: any) => r.order_id).filter(Boolean))
    ) as string[]

    const ordersById = new Map<string, any>()
    if (orderIds.length) {
      const { data: ordersData } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "email",
          "customer_id",
          "created_at",
          "summary",
          "items.id",
          "items.title",
          "items.quantity",
          "items.product_id",
          "items.variant.product_id",
          "customer.first_name",
          "customer.last_name",
          "customer.email",
          "shipping_address.first_name",
          "shipping_address.last_name",
        ],
        filters: { id: orderIds },
      })

      for (const order of ordersData || []) {
        if (order?.id) ordersById.set(order.id, order)
      }
    }

    const vendorOrderIds = new Set<string>()
    for (const [orderId, order] of ordersById) {
      const items = order.items || []
      const belongsToVendor = items.some((item: any) => {
        const productId = item.product_id || item.variant?.product_id
        return productId && vendorProductIds.has(productId)
      })
      if (belongsToVendor) vendorOrderIds.add(orderId)
    }

    const vendorRequests = requests.filter(
      (request: any) => request.order_id && vendorOrderIds.has(request.order_id)
    )

    const requestIds = new Set(vendorRequests.map((r: any) => r.id))
    const allItems = requestIds.size
      ? await returnService.listReturnRequestItems({})
      : []

    const itemsByRequest = new Map<string, any[]>()
    for (const item of allItems) {
      if (!requestIds.has(item.return_request_id)) continue
      const list = itemsByRequest.get(item.return_request_id) || []
      list.push(item)
      itemsByRequest.set(item.return_request_id, list)
    }

    const enriched = vendorRequests.map((request: any) => {
      const order = request.order_id ? ordersById.get(request.order_id) : null
      const customer = order?.customer || null
      const customerName = [
        customer?.first_name || order?.shipping_address?.first_name || "",
        customer?.last_name || order?.shipping_address?.last_name || "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim()

      const orderItems = order?.items || []
      const vendorLineItems = orderItems.filter((item: any) => {
        const productId = item.product_id || item.variant?.product_id
        return productId && vendorProductIds.has(productId)
      })

      return {
        id: request.id,
        order_id: request.order_id,
        order_display_id: order?.display_id ?? null,
        type: request.type,
        status: request.status,
        reason: request.reason,
        notes: request.notes,
        payment_type: request.payment_type,
        refund_method: request.refund_method,
        rejection_reason: request.rejection_reason,
        approved_at: request.approved_at,
        rejected_at: request.rejected_at,
        pickup_initiated_at: request.pickup_initiated_at,
        picked_up_at: request.picked_up_at,
        received_at: request.received_at,
        refunded_at: request.refunded_at,
        shiprocket_awb: request.shiprocket_awb,
        shiprocket_status: request.shiprocket_status,
        created_at: request.created_at,
        updated_at: request.updated_at,
        customer_email: order?.email || customer?.email || null,
        customer_name: customerName || null,
        items: itemsByRequest.get(request.id) || [],
        vendor_items: vendorLineItems.map((item: any) => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
        })),
        order_total: order?.summary?.current_order_total ?? null,
      }
    })

    enriched.sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime()
      const bTime = new Date(b.created_at || 0).getTime()
      return bTime - aTime
    })

    return res.json({ return_requests: enriched })
  } catch (error: any) {
    console.error("[Vendor returns] error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to list returns",
    })
  }
}

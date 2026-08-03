import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import ReturnModuleService from "../../../modules/returns/service"
import { RETURN_MODULE } from "../../../modules/returns"
import { getItemUnits, getVendorWorkflow } from "../../../lib/vendor-order-workflow"
import {
  getReverseCourierSelection,
  getReturnMetadata,
  getSelfReverseTracking,
  resolveVendorForwardShippingMethod,
} from "../../../lib/vendor-return-shiprocket"

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
 * Lists return/replacement requests for this vendor's products.
 * Includes pending_approval so Easy Ship vendors can select a reverse courier
 * before admin approval (pickup then runs automatically).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const VENDOR_VISIBLE_STATUSES = new Set([
    "pending_approval",
    "approved",
    "pickup_initiated",
    "picked_up",
    "received",
    "refunded",
    "replaced",
    "closed",
  ])

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

    const visibleRequests = requests.filter(
      (request: any) =>
        request?.status && VENDOR_VISIBLE_STATUSES.has(String(request.status))
    )

    if (!visibleRequests.length) {
      return res.json({ return_requests: [] })
    }

    const orderIds = Array.from(
      new Set(visibleRequests.map((r: any) => r.order_id).filter(Boolean))
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
          "metadata",
          "items.id",
          "items.title",
          "items.quantity",
          "items.detail.quantity",
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

    const vendorRequests = visibleRequests.filter(
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

      const returnItems = itemsByRequest.get(request.id) || []
      const orderItemById = new Map<string, any>(
        orderItems.map((item: any) => [String(item.id), item])
      )

      const enrichedItems = returnItems.map((ri: any) => {
        const original = orderItemById.get(String(ri.order_item_id))
        const qty = Number(ri.quantity)
        return {
          id: ri.id,
          order_item_id: ri.order_item_id,
          quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
          condition: ri.condition ?? null,
          reason: ri.reason ?? null,
          title: (original as any)?.title || "Item",
        }
      })

      const workflow = getVendorWorkflow(order?.metadata || null, auth.vendor_id)
      const shippingMethod =
        resolveVendorForwardShippingMethod(order, auth.vendor_id) ||
        (workflow.shipping_method === "easy" ? "easy" : workflow.shipping_method === "self" ? "self" : null)
      const selection = getReverseCourierSelection(request)
      const meta = getReturnMetadata(request)
      const selfTracking = getSelfReverseTracking(request)
      const hasSelfTracking = Boolean(
        selfTracking.reverse_tracking_number || selfTracking.reverse_tracking_url
      )
      const activeForLogistics = ["pending_approval", "approved", "pickup_initiated"].includes(
        String(request.status)
      )

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
        items: enrichedItems,
        vendor_items: vendorLineItems.map((item: any) => ({
          id: item.id,
          title: item.title,
          quantity: getItemUnits(item),
        })),
        order_total: order?.summary?.current_order_total ?? null,
        shipping_method: shippingMethod,
        reverse_courier_id: selection?.reverse_courier_id ?? meta.reverse_courier_id ?? null,
        reverse_courier_name:
          selection?.reverse_courier_name ?? meta.reverse_courier_name ?? null,
        reverse_courier_rate:
          meta.reverse_courier_rate != null ? Number(meta.reverse_courier_rate) : null,
        reverse_courier_selected_at:
          selection?.reverse_courier_selected_at ??
          meta.reverse_courier_selected_at ??
          null,
        ...selfTracking,
        can_select_reverse_courier:
          shippingMethod === "easy" &&
          ["pending_approval", "approved"].includes(String(request.status)) &&
          !request.pickup_initiated_at &&
          !request.shiprocket_order_id,
        can_add_self_tracking: shippingMethod === "self" && activeForLogistics,
        needs_return_logistics:
          activeForLogistics &&
          ((shippingMethod === "easy" &&
            !selection &&
            !meta.reverse_courier_id &&
            !request.shiprocket_order_id) ||
            (shippingMethod === "self" && !hasSelfTracking)),
        can_mark_pickup_initiated: ["approved", "pending_approval"].includes(
          String(request.status)
        ),
        can_mark_picked_up: ["approved", "pickup_initiated"].includes(String(request.status)),
        can_mark_received: ["approved", "pickup_initiated", "picked_up"].includes(
          String(request.status)
        ),
        returned_to_vendor:
          String(request.status) === "received" || Boolean(meta.returned_to_vendor),
        returned_to_vendor_at: meta.returned_to_vendor_at
          ? String(meta.returned_to_vendor_at)
          : request.received_at || null,
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

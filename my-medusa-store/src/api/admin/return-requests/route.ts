import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import ReturnModuleService from "../../../modules/returns/service"
import { RETURN_MODULE } from "../../../modules/returns"
import { resolveOrderReturnShippingContext } from "../../../lib/vendor-return-shiprocket"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const requests = await returnService.listReturnRequests({})

  const query = req.scope.resolve("query")
  const orderIds = Array.from(
    new Set(requests.map((request: any) => request.order_id).filter(Boolean))
  ) as string[]
  const ordersById = new Map<string, any>()

  if (orderIds.length) {
    try {
      const { data: ordersData } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "customer_id",
          "email",
          "metadata",
          "summary",
          "shipping_address.first_name",
          "shipping_address.last_name",
          "customer.first_name",
          "customer.last_name",
          "customer.email",
        ],
        filters: { id: orderIds },
      })
      for (const order of ordersData || []) {
        if (order?.id) {
          ordersById.set(order.id, order)
        }
      }
    } catch (err) {
      console.warn("[return-requests] Failed to load orders via query", err)
    }
  }

  const requestIds = new Set(requests.map((request: any) => request.id))
  const items = requestIds.size ? await returnService.listReturnRequestItems({}) : []

  const itemsByRequest = new Map<string, any[]>()
  for (const item of items) {
    if (!requestIds.has(item.return_request_id)) {
      continue
    }
    const list = itemsByRequest.get(item.return_request_id) || []
    list.push(item)
    itemsByRequest.set(item.return_request_id, list)
  }

  const enriched = requests.map((request: any) => {
    const order = request.order_id ? ordersById.get(request.order_id) : null
    const metadata = order?.metadata || {}
    const summary = order?.summary || {}
    const coinMinor =
      typeof metadata?.coin_discount_minor === "number"
        ? metadata.coin_discount_minor
        : typeof metadata?.coin_discount_rupees === "number"
          ? Math.round(metadata.coin_discount_rupees * 100)
          : 0
    const coinsUsed =
      typeof metadata?.coins_discountend === "number"
        ? metadata.coins_discountend
        : coinMinor > 0
          ? coinMinor / 100
          : typeof summary?.pending_difference === "number"
            ? summary.pending_difference
            : typeof summary?.discount_total === "number"
              ? summary.discount_total
              : 0

    const customer = order?.customer || null
    const customerName =
      customer?.first_name ||
      customer?.last_name ||
      order?.shipping_address?.first_name ||
      order?.shipping_address?.last_name
        ? [
            customer?.first_name || order?.shipping_address?.first_name || "",
            customer?.last_name || order?.shipping_address?.last_name || "",
          ]
            .filter(Boolean)
            .join(" ")
            .trim()
        : null

    const shippingContext = resolveOrderReturnShippingContext(order, request)
    const returnMeta =
      request?.metadata && typeof request.metadata === "object" && !Array.isArray(request.metadata)
        ? (request.metadata as Record<string, any>)
        : {}
    const returnedToVendor =
      String(request.status) === "received" || Boolean(returnMeta.returned_to_vendor)

    return {
      ...request,
      items: itemsByRequest.get(request.id) || [],
      order_display_id: order?.display_id ?? null,
      customer_id: order?.customer_id || request.customer_id || null,
      customer_email: order?.email || customer?.email || null,
      customer_name: customerName || null,
      coins_used: Number.isFinite(coinsUsed) ? coinsUsed : 0,
      shipping_method: shippingContext.shipping_method,
      reverse_courier_id: shippingContext.reverse_courier_id,
      reverse_courier_name: shippingContext.reverse_courier_name,
      reverse_courier_rate: shippingContext.reverse_courier_rate,
      reverse_tracking_number: shippingContext.reverse_tracking_number,
      reverse_tracking_url: shippingContext.reverse_tracking_url,
      reverse_label_url: shippingContext.reverse_label_url,
      reverse_courier_partner: shippingContext.reverse_courier_partner,
      reverse_tracking_saved_at: shippingContext.reverse_tracking_saved_at,
      returned_to_vendor: returnedToVendor,
      returned_to_vendor_at:
        returnMeta.returned_to_vendor_at ||
        request.received_at ||
        (order?.metadata as any)?.returned_to_vendor_at ||
        null,
    }
  })

  const sorted = [...enriched].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime()
    const bTime = new Date(b.created_at || 0).getTime()
    return bTime - aTime
  })

  return res.json({ return_requests: sorted })
}

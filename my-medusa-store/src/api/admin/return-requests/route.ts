import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import ReturnModuleService from "../../../modules/returns/service"
import { RETURN_MODULE } from "../../../modules/returns"

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
      customer?.first_name || customer?.last_name || order?.shipping_address?.first_name || order?.shipping_address?.last_name
        ? [
          customer?.first_name || order?.shipping_address?.first_name || "",
          customer?.last_name || order?.shipping_address?.last_name || "",
        ].filter(Boolean).join(" ").trim()
        : null

    return {
      ...request,
      items: itemsByRequest.get(request.id) || [],
      customer_id: order?.customer_id || request.customer_id || null,
      customer_email: order?.email || customer?.email || null,
      customer_name: customerName || null,
      coins_used: Number.isFinite(coinsUsed) ? coinsUsed : 0,
    }
  })

  return res.json({ return_requests: enriched })
}

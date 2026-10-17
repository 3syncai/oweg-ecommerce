import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { RETURN_MODULE } from "../../../modules/returns"
import type ReturnModuleService from "../../../modules/returns/service"
import {
  buildCustomerReliability,
  customerReliabilityKey,
  newCustomerReliability,
} from "../../../lib/customer-reliability"

/** Admin-only customer history rating list. It is computed live, never stored. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query")
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id", "customer_id", "email", "created_at", "fulfillments.delivered_at",
      "customer.first_name", "customer.last_name", "shipping_address.first_name", "shipping_address.last_name",
    ],
    filters: {},
  })
  const returns = req.scope.resolve(RETURN_MODULE) as ReturnModuleService
  const requests = await returns.listReturnRequests({})
  const ratings = buildCustomerReliability(
    orders.map((order: any) => ({
      id: order.id,
      customer_id: order.customer_id,
      email: order.email,
      delivered: (order.fulfillments || []).some((fulfillment: any) => fulfillment.delivered_at),
    })),
    requests as any[]
  )
  const customers = new Map<string, any>()
  for (const order of orders) {
    const key = customerReliabilityKey(order)
    const previous = customers.get(key)
    const name = [order.customer?.first_name || order.shipping_address?.first_name,
      order.customer?.last_name || order.shipping_address?.last_name].filter(Boolean).join(" ") || "Guest customer"
    customers.set(key, {
      customer_key: key,
      customer_id: order.customer_id || null,
      name: previous?.name || name,
      email: previous?.email || order.email || null,
      orders_count: (previous?.orders_count || 0) + 1,
      customer_reliability: ratings.get(key) || newCustomerReliability(),
    })
  }
  res.setHeader("Cache-Control", "no-store")
  return res.json({
    customers: [...customers.values()].sort((a, b) => {
      const aRating = a.customer_reliability.rating ?? -1
      const bRating = b.customer_reliability.rating ?? -1
      return aRating - bRating || b.orders_count - a.orders_count
    }),
  })
}

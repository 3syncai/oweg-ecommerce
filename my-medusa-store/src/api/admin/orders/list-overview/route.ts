import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { RETURN_MODULE } from "../../../../modules/returns"
import type VendorModuleService from "../../../../modules/vendor/service"
import type ReturnModuleService from "../../../../modules/returns/service"
import { getVendorWorkflows } from "../../../../lib/vendor-order-workflow"
import { orderListOverview } from "../../../../lib/admin-order-list"
import {
  buildCustomerReliability,
  customerReliabilityKey,
  newCustomerReliability,
} from "../../../../lib/customer-reliability"

// One bounded batch for the visible order page; existing Orders RBAC applies.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const ids = typeof req.query.ids === "string" ? [...new Set(req.query.ids.split(","))] : []
  if (!ids.length || ids.length > 100 || ids.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id)))
    return res.status(400).json({ message: "Provide between 1 and 100 valid order IDs." })
  const query = req.scope.resolve("query")
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "email", "status", "metadata", "items.id", "items.quantity", "items.detail.quantity",
      "items.product_id", "items.variant.product_id", "items.detail.return_received_quantity",
      "fulfillments.id", "fulfillments.shipped_at", "fulfillments.delivered_at", "fulfillments.canceled_at"],
    filters: { id: ids },
  })
  const productIds = [...new Set(orders.flatMap((order: any) =>
    (order.items || []).map((item: any) => item.product_id || item.variant?.product_id).filter(Boolean)
  ))]
  const products = new Map<string, any>()
  if (productIds.length) {
    const { data } = await query.graph({
      entity: "product", fields: ["id", "metadata"], filters: { id: productIds },
    })
    for (const product of data) products.set(product.id, product)
  }
  const vendorIds = [...new Set([
    ...orders.flatMap((order: any) => Object.keys(getVendorWorkflows(order.metadata))),
    ...[...products.values()].map((p) => p.metadata?.vendor_id).filter(Boolean),
  ])]
  const vendors = new Map<string, any>()
  if (vendorIds.length) {
    const service = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
    const profiles = await service.listVendors({ id: vendorIds }, {
      select: ["id", "store_name", "name"], take: vendorIds.length,
    })
    for (const vendor of profiles) vendors.set(vendor.id, vendor)
  }
  const returns = req.scope.resolve(RETURN_MODULE) as ReturnModuleService
  const requests = await returns.listReturnRequests({ order_id: ids })
  const customerIds = [...new Set(orders.map((order: any) => order.customer_id).filter(Boolean))]
  const customerHistory = customerIds.length
    ? (await query.graph({
        entity: "order",
        fields: ["id", "customer_id", "email", "fulfillments.delivered_at"],
        filters: { customer_id: customerIds },
      })).data
    : orders
  const customerHistoryIds = customerHistory.map((order: any) => order.id)
  const customerRequests = customerHistoryIds.length
    ? await returns.listReturnRequests({ order_id: customerHistoryIds })
    : requests
  const reliabilityByCustomer = buildCustomerReliability(
    customerHistory.map((order: any) => ({
      id: order.id,
      customer_id: order.customer_id,
      email: order.email,
      delivered: (order.fulfillments || []).some((fulfillment: any) => fulfillment.delivered_at),
    })),
    customerRequests as any[]
  )
  const received = requests.filter((r: any) => r.status === "received" || r.received_at || r.metadata?.returned_to_vendor)
  const receivedByItem = new Map<string, number>()
  if (received.length) {
    const returnItems = await returns.listReturnRequestItems({ return_request_id: received.map((r: any) => r.id) })
    for (const item of returnItems) {
      receivedByItem.set(item.order_item_id,
        (receivedByItem.get(item.order_item_id) || 0) + Number(item.quantity || 0))
    }
  }
  res.setHeader("Cache-Control", "no-store")
  return res.json({ orders: orders.map((order: any) => orderListOverview(
    order, products, vendors, receivedByItem,
    reliabilityByCustomer.get(customerReliabilityKey(order)) || newCustomerReliability()
  )) })
}

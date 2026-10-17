import {
  deriveVendorStage,
  getPaymentType,
  getVendorWorkflows,
  isOrderCancelled,
} from "./vendor-order-workflow"

const stageLabels: Record<string, string> = {
  to_accept: "To Accept",
  to_pack: "To Pack",
  to_dispatch: "To Dispatch",
  in_transit: "In-Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

function itemQuantity(item: any): number | null {
  const value = item.quantity ?? item.detail?.quantity ?? item.raw_quantity ?? item.detail?.raw_quantity
  const quantity = Number(typeof value === "object" ? value?.value : value)
  return value == null || !Number.isFinite(quantity) ? null : quantity
}

export function orderListOverview(
  order: any,
  products: Map<string, any>,
  vendors: Map<string, any>,
  receivedByItem = new Map<string, number>(),
  customerReliability?: any
) {
  const items: any[] = order.items || []
  const workflows = getVendorWorkflows(order.metadata)
  const productVendor = (item: any) =>
    products.get(item.product_id || item.variant?.product_id)?.metadata?.vendor_id
  const vendorIds = [...new Set([
    ...Object.keys(workflows),
    ...items.map(productVendor).filter(Boolean),
  ])] as string[]
  const quantity = items.some((item) => itemQuantity(item) === null)
    ? null : items.reduce((sum, item) => sum + (itemQuantity(item) || 0), 0)
  const status = (workflow: any, scopedOrder = order) => {
    if (isOrderCancelled(order)) return "Cancelled"
    const scopedItems = scopedOrder.items || []
    const scopedQuantity = scopedItems.reduce((sum: number, item: any) => sum + (itemQuantity(item) || 0), 0)
    const returned = scopedItems.reduce((sum: number, item: any) => sum + Math.max(
      Number(item.detail?.return_received_quantity || 0), receivedByItem.get(item.id) || 0
    ), 0)
    if (returned > 0) return returned >= scopedQuantity ? "Returned" : "Partially Returned"
    return stageLabels[deriveVendorStage(scopedOrder, workflow)] || "To Accept"
  }
  const stores = vendorIds.map((id) => {
    const workflow = workflows[id] || {}
    // An order's delivered fulfillment must not mark another store delivered.
    const scoped = vendorIds.length > 1
      ? { ...order, items: items.filter((item) => productVendor(item) === id), fulfillments: (order.fulfillments || []).filter(
          (f: any) => f.id === workflow.medusa_fulfillment_id
        ) }
      : order
    return {
      name: workflow.store_name || vendors.get(id)?.store_name ||
        workflow.vendor_name || vendors.get(id)?.name || "Store unavailable",
      status: status(workflow, scoped),
    }
  })
  return {
    id: order.id,
    payment: getPaymentType(order) === "PostPaid" ? "COD" : "Prepaid",
    customer_reliability: customerReliability,
    quantity,
    stores,
    status: stores.length ? [...new Set(stores.map((s) => s.status))].join(" / ") : status({}),
  }
}

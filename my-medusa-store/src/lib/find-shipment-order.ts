import { getVendorWorkflows } from "./vendor-order-workflow"

// Scan every page without loading the entire order history into memory.
export async function findShipmentOrder(service: { listOrders: Function }, awb: string, providerOrderId: string) {
  const take = 500
  for (let skip = 0; ; skip += take) {
    const orders = await service.listOrders({}, { take, skip, order: { id: "ASC" } })
    const match = orders.find((order: any) => {
      const metadata = order.metadata || {}
      if (awb && String(metadata.shiprocket_awb || "") === awb) return true
      if (providerOrderId && String(metadata.shiprocket_order_id || "") === providerOrderId) return true
      return Object.values(getVendorWorkflows(metadata)).some((wf) =>
        Boolean((awb && (wf.shiprocket_awb === awb || wf.tracking_number === awb)) ||
          (providerOrderId && String(wf.shiprocket_order_id || "") === providerOrderId)))
    })
    if (match) return match
    if (orders.length < take) return null
  }
}

import type { MedusaRequest } from "@medusajs/framework/http"
import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
} from "@medusajs/core-flows"
import { Modules } from "@medusajs/framework/utils"
import {
  getItemUnits,
  pickVendorItems,
  type VendorOrderWorkflow,
} from "./vendor-order-workflow"

type OrderLike = {
  id: string
  items?: any[]
  fulfillments?: any[]
  metadata?: Record<string, unknown> | null
}

async function resolveStockLocationId(req: MedusaRequest): Promise<string> {
  const stockLocationModule = req.scope.resolve(Modules.STOCK_LOCATION)
  const locations = await stockLocationModule.listStockLocations({}, { take: 1 })
  const locationId = locations?.[0]?.id
  if (!locationId) {
    throw new Error("No stock location configured. Add a stock location in Admin → Settings.")
  }
  return locationId
}

function buildLabels(workflow: VendorOrderWorkflow) {
  const trackingNumber = String(
    workflow.tracking_number ||
      workflow.shiprocket_awb ||
      workflow.self_awb ||
      "PENDING"
  ).slice(0, 120)

  const trackingUrl = String(
    workflow.tracking_url ||
      (trackingNumber !== "PENDING"
        ? `https://shiprocket.co/tracking/${encodeURIComponent(trackingNumber)}`
        : "https://oweg.in")
  ).slice(0, 500)

  const labelUrl = String(workflow.label_url || trackingUrl).slice(0, 500)

  return [
    {
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      label_url: labelUrl,
    },
  ]
}

/**
 * Create Medusa fulfillment for vendor items.
 * Optionally create shipment (mark shipped). Amazon-style RTD always ships when
 * tracking is present so the order moves to In Transit immediately.
 */
export async function fulfillAndShipVendorItems(
  req: MedusaRequest,
  order: OrderLike,
  vendorId: string,
  vendorProductIds: string[],
  workflow: VendorOrderWorkflow,
  options?: { createShipment?: boolean }
): Promise<{ fulfillment_id: string; already_done: boolean; shipped: boolean }> {
  const createShipment = options?.createShipment !== false

  if (workflow.medusa_fulfillment_id && workflow.medusa_shipped_at) {
    return {
      fulfillment_id: String(workflow.medusa_fulfillment_id),
      already_done: true,
      shipped: true,
    }
  }

  if (workflow.medusa_fulfillment_id && !createShipment) {
    return {
      fulfillment_id: String(workflow.medusa_fulfillment_id),
      already_done: true,
      shipped: Boolean(workflow.medusa_shipped_at),
    }
  }

  const vendorItems = pickVendorItems(order as any, vendorProductIds)
  if (!vendorItems.length) {
    throw new Error("No vendor items found to fulfill")
  }

  const items = vendorItems.map((item: any) => ({
    id: String(item.id),
    quantity: getItemUnits(item),
  }))

  const labels = buildLabels(workflow)
  const locationId = await resolveStockLocationId(req)

  let fulfillmentId = workflow.medusa_fulfillment_id
    ? String(workflow.medusa_fulfillment_id)
    : null

  if (!fulfillmentId) {
    const existing = (order.fulfillments || []).find(
      (f: any) =>
        !f?.canceled_at &&
        (f?.metadata?.vendor_id === vendorId ||
          f?.metadata?.oweg_vendor_id === vendorId)
    )
    if (existing?.id) {
      fulfillmentId = existing.id
    }
  }

  if (!fulfillmentId) {
    const { result } = await createOrderFulfillmentWorkflow(req.scope).run({
      input: {
        order_id: order.id,
        items,
        location_id: locationId,
        labels,
        no_notification: false,
        metadata: {
          vendor_id: vendorId,
          oweg_vendor_id: vendorId,
          shipping_method: workflow.shipping_method || null,
          source: "vendor_rtd",
        },
      },
    })
    fulfillmentId = String((result as any)?.id || "")
    if (!fulfillmentId) {
      throw new Error("Fulfillment was created but no id was returned")
    }
  }

  const alreadyShipped = (order.fulfillments || []).some(
    (f: any) => f?.id === fulfillmentId && f?.shipped_at && !f?.canceled_at
  )

  let shipped = alreadyShipped || Boolean(workflow.medusa_shipped_at)

  if (createShipment && !shipped) {
    await createOrderShipmentWorkflow(req.scope).run({
      input: {
        order_id: order.id,
        fulfillment_id: fulfillmentId,
        items,
        labels,
        no_notification: false,
        metadata: {
          vendor_id: vendorId,
          source: "vendor_rtd",
        },
      },
    })
    shipped = true
  }

  return { fulfillment_id: fulfillmentId, already_done: false, shipped }
}

/**
 * Mark an existing vendor fulfillment as shipped (To Dispatch → In Transit).
 */
export async function shipVendorFulfillment(
  req: MedusaRequest,
  order: OrderLike,
  vendorId: string,
  vendorProductIds: string[],
  workflow: VendorOrderWorkflow
): Promise<{ fulfillment_id: string; already_shipped: boolean }> {
  const result = await fulfillAndShipVendorItems(
    req,
    order,
    vendorId,
    vendorProductIds,
    workflow,
    { createShipment: true }
  )
  return {
    fulfillment_id: result.fulfillment_id,
    already_shipped: result.already_done && result.shipped,
  }
}

import {
  listOpenVendorShipmentsForSync,
  syncVendorShipmentTracking,
} from "../lib/vendor-shipment-tracking-sync"
import { getVendorProductIds } from "../lib/vendor-order-workflow"

/**
 * Amazon-style carrier polling:
 * Every 10 minutes, pull tracking for open self/easy shipments and auto-advance
 * In Transit → Out for delivery → Delivered (earnings scheduled on deliver).
 */
export default async function syncVendorShipmentTrackingJob(container: any) {
  const logger = container.resolve("logger")
  const query = container.resolve("query")

  let targets: Array<{ order_id: string; vendor_id: string }> = []
  try {
    targets = await listOpenVendorShipmentsForSync(80)
  } catch (error: any) {
    logger.warn(`[shipment-sync-job] list failed: ${error?.message}`)
    return
  }

  if (!targets.length) {
    logger.info("[shipment-sync-job] no open shipments")
    return
  }

  logger.info(`[shipment-sync-job] syncing ${targets.length} shipment(s)`)
  let updated = 0

  for (const target of targets) {
    try {
      const { data } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "metadata",
          "items.id",
          "items.product_id",
          "items.variant.product_id",
          "fulfillments.id",
          "fulfillments.shipped_at",
          "fulfillments.delivered_at",
          "fulfillments.canceled_at",
        ],
        filters: { id: target.order_id },
      })
      const order = data?.[0]
      if (!order) continue

      const reqLike = { scope: container } as any
      const vendorProductIds = await getVendorProductIds(reqLike, target.vendor_id)

      const result = await syncVendorShipmentTracking({
        container,
        order,
        vendorId: target.vendor_id,
        vendorProductIds,
        ensureShippedOnMovement: true,
      })
      if (result.updated) updated += 1
    } catch (error: any) {
      logger.warn(
        `[shipment-sync-job] order=${target.order_id} vendor=${target.vendor_id}: ${error?.message}`
      )
    }
  }

  logger.info(`[shipment-sync-job] done updated=${updated}/${targets.length}`)
}

export const config = {
  name: "sync-vendor-shipment-tracking",
  schedule: "*/10 * * * *",
}

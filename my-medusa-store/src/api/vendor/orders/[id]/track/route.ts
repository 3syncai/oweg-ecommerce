import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import {
  formatVendorOrder,
  getVendorOrderOrRespond,
  getVendorWorkflow,
  setVendorOrderCorsHeaders,
} from "../../../../../lib/vendor-order-workflow"
import { syncVendorShipmentTracking } from "../../../../../lib/vendor-shipment-tracking-sync"

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

/**
 * GET /vendor/orders/:id/track
 * Amazon-style: pull carrier status and auto-advance In Transit / Delivered.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  try {
    const result = await getVendorOrderOrRespond(req, res, auth.vendor_id, orderId)
    if (!result) return

    const workflow = getVendorWorkflow(result.order.metadata, auth.vendor_id)
    if (!workflow.shipping_method) {
      return res.json({
        order: formatVendorOrder(result.order, auth.vendor_id, result.vendorProductIds),
        tracking: {
          provider: "none",
          status: "not_shipped",
          error: "No shipping method selected yet",
          checkpoints: [],
        },
      })
    }

    const synced = await syncVendorShipmentTracking({
      container: req.scope,
      order: result.order,
      vendorId: auth.vendor_id,
      vendorProductIds: result.vendorProductIds,
      ensureShippedOnMovement: true,
    })

    const order = {
      ...result.order,
      metadata: synced.metadata || result.order.metadata,
    }

    return res.json({
      order: formatVendorOrder(order, auth.vendor_id, result.vendorProductIds),
      tracking: synced.tracking,
    })
  } catch (error: any) {
    console.error("Vendor order tracking error:", error)
    return res.status(500).json({ message: error?.message || "Failed to track order" })
  }
}

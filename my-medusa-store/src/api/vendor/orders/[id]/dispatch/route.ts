import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import { shipVendorFulfillment } from "../../../../../lib/vendor-order-fulfillment"
import {
  formatVendorOrder,
  getVendorOrderOrRespond,
  getVendorWorkflow,
  setVendorOrderCorsHeaders,
  updateVendorOrderWorkflow,
} from "../../../../../lib/vendor-order-workflow"

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

/**
 * POST /vendor/orders/:id/dispatch
 * To Dispatch → In Transit (create shipment + mark shipped).
 * Used after self-ship RTD when the package is handed to the courier.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  try {
    const result = await getVendorOrderOrRespond(req, res, auth.vendor_id, orderId)
    if (!result) return

    const workflow = getVendorWorkflow(result.order.metadata, auth.vendor_id)
    if (!workflow.rtd_at && workflow.stage !== "to_dispatch") {
      return res.status(409).json({
        message: "Mark Ready to Dispatch (RTD) before dispatching",
      })
    }
    if (!workflow.shipping_method) {
      return res.status(409).json({ message: "Shipping method is required before dispatch" })
    }

    const { fulfillment_id } = await shipVendorFulfillment(
      req,
      result.order,
      auth.vendor_id,
      result.vendorProductIds,
      workflow
    )

    const shippedAt = new Date().toISOString()
    const metadata = await updateVendorOrderWorkflow(req, result.order, auth.vendor_id, {
      stage: "in_transit",
      medusa_fulfillment_id: fulfillment_id,
      medusa_shipped_at: workflow.medusa_shipped_at || shippedAt,
      shiprocket_status: "shipped",
      dispatched_at: shippedAt,
    })

    return res.json({
      order: formatVendorOrder(
        { ...result.order, metadata },
        auth.vendor_id,
        result.vendorProductIds
      ),
      fulfillment_id,
      automated: {
        fulfilled: true,
        shipped: true,
        stage: "in_transit",
      },
    })
  } catch (error: any) {
    console.error("Vendor order dispatch error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to dispatch order",
    })
  }
}

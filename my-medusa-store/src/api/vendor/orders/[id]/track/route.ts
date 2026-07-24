import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import ShiprocketService from "../../../../../services/shiprocket"
import { trackSelfShipment } from "../../../../../services/self-shipping-tracking"
import {
  extractTrackingStatus,
  formatVendorOrder,
  getVendorOrderOrRespond,
  getVendorWorkflow,
  isMovementTrackingStatus,
  isPreDispatchTrackingStatus,
  normalizeTrackingStatus,
  setVendorOrderCorsHeaders,
  summarizeTrackingPayload,
  updateVendorOrderWorkflow,
  type VendorOrderStage,
} from "../../../../../lib/vendor-order-workflow"

function stageFromTracking(status: string): VendorOrderStage | null {
  if (status === "delivered") return "delivered"
  if (isMovementTrackingStatus(status)) return "in_transit"
  if (isPreDispatchTrackingStatus(status)) return "to_dispatch"
  return null
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

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
    let tracking: any = null
    let status = normalizeTrackingStatus(workflow.shiprocket_status || workflow.stage)
    let metadata = result.order.metadata
    const awb = workflow.shipping_method === "easy" ? workflow.shiprocket_awb : workflow.self_awb

    if (workflow.shipping_method === "easy" && awb) {
      const shiprocket = new ShiprocketService()
      try {
        const payload = await shiprocket.trackByAwb(String(awb))
        status = extractTrackingStatus(payload) || status
        const nextStage = stageFromTracking(status)
        const statusPatch =
          workflow.shipping_method === "easy"
            ? { shiprocket_status: status || workflow.shiprocket_status || null }
            : { shiprocket_status: status || workflow.shiprocket_status || null }

        metadata = await updateVendorOrderWorkflow(req, result.order, auth.vendor_id, {
          ...(nextStage ? { stage: nextStage } : {}),
          ...statusPatch,
        })
        tracking = summarizeTrackingPayload({
          provider: "easy",
          courierPartnerName: "Shiprocket",
          awb: String(awb),
          payload,
          status,
        })
      } catch (trackingError: any) {
        tracking = summarizeTrackingPayload({
          provider: "easy",
          courierPartnerName: "Shiprocket",
          awb: String(awb),
          status: status || "not_shipped",
          error: trackingError?.message || "Tracking is unavailable",
        })
      }
    } else if (workflow.shipping_method === "self") {
      tracking = await trackSelfShipment({
        courierPartnerName: workflow.self_courier_partner || null,
        awb: workflow.self_awb || null,
        trackingSource: workflow.self_tracking_source || null,
      })

      status = normalizeTrackingStatus(tracking?.status || status)
      const nextStage = stageFromTracking(status)
      if (nextStage || status) {
        metadata = await updateVendorOrderWorkflow(req, result.order, auth.vendor_id, {
          ...(nextStage ? { stage: nextStage } : {}),
          shiprocket_status: status || workflow.shiprocket_status || null,
        })
      }
    } else {
      tracking = summarizeTrackingPayload({
        provider: "self",
        courierPartnerName: workflow.self_courier_partner || null,
        awb: workflow.self_awb || null,
        status: status || "not_shipped",
      })
    }

    return res.json({
      order: formatVendorOrder({ ...result.order, metadata }, auth.vendor_id, result.vendorProductIds),
      tracking,
    })
  } catch (error: any) {
    console.error("Vendor order tracking error:", error)
    return res.status(500).json({ message: error?.message || "Failed to track order" })
  }
}

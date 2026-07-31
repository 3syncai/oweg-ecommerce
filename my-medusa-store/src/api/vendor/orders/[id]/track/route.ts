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
    const awb =
      workflow.shipping_method === "easy"
        ? workflow.shiprocket_awb || workflow.tracking_number
        : workflow.self_awb || workflow.tracking_number

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
          courierPartnerName: workflow.easy_courier_partner || "Shiprocket",
          awb: String(awb),
          payload,
          status,
        })
        tracking.tracking_url = workflow.tracking_url || tracking.tracking_url || null
        tracking.label_url = workflow.label_url || null
      } catch (trackingError: any) {
        tracking = summarizeTrackingPayload({
          provider: "easy",
          courierPartnerName: workflow.easy_courier_partner || "Shiprocket",
          awb: String(awb),
          status: status || "not_shipped",
          error: trackingError?.message || "Tracking is unavailable",
        })
        tracking.tracking_url = workflow.tracking_url || null
        tracking.label_url = workflow.label_url || null
      }
    } else if (workflow.shipping_method === "easy") {
      // Booked on Shiprocket but AWB not assigned yet (common with KYC / assign failures)
      tracking = {
        provider: "easy",
        courier_partner_name: workflow.easy_courier_partner || "Shiprocket",
        awb: null,
        status: normalizeTrackingStatus(workflow.shiprocket_status || "created"),
        status_label: "AWB pending",
        source: "shiprocket",
        error:
          "Shiprocket shipment was created, but AWB was not assigned yet. Complete Shiprocket KYC or re-book Easy Shipping to get tracking.",
        checkpoints: [],
        shiprocket_order_id: workflow.shiprocket_order_id || null,
        shiprocket_shipment_id: workflow.shiprocket_shipment_id || null,
        tracking_url: workflow.tracking_url || null,
        label_url: workflow.label_url || null,
      }
    } else if (workflow.shipping_method === "self") {
      tracking = await trackSelfShipment({
        courierPartnerName: workflow.self_courier_partner || null,
        awb: workflow.self_awb || workflow.tracking_number || null,
        trackingSource: workflow.self_tracking_source || null,
      })
      if (workflow.tracking_url) {
        tracking.tracking_url = workflow.tracking_url
      }
      if (workflow.label_url) {
        tracking.label_url = workflow.label_url
      }

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
        provider: "none",
        courierPartnerName: null,
        awb: null,
        status: status || "not_shipped",
        error: "No shipping method selected yet",
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

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import { fulfillAndShipVendorItems } from "../../../../../lib/vendor-order-fulfillment"
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
 * POST /vendor/orders/:id/rtd
 * Ready to Dispatch → create Medusa fulfillment, then mark shipped with tracking labels.
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
    if (!workflow.invoice_generated_at) {
      return res.status(409).json({ message: "Generate invoice before marking RTD" })
    }
    if (!workflow.shipping_method) {
      return res.status(409).json({
        message: "Choose Easy or Self shipping (with tracking details) before RTD",
      })
    }

    const hasTracking = Boolean(
      workflow.tracking_number ||
        workflow.shiprocket_awb ||
        workflow.self_awb ||
        workflow.tracking_url
    )
    if (!hasTracking) {
      return res.status(409).json({
        message: "Add AWB / tracking number or tracking URL before RTD",
      })
    }

    const { fulfillment_id } = await fulfillAndShipVendorItems(
      req,
      result.order,
      auth.vendor_id,
      result.vendorProductIds,
      workflow
    )

    const shippedAt = new Date().toISOString()
    const metadata = await updateVendorOrderWorkflow(req, result.order, auth.vendor_id, {
      stage: "in_transit",
      rtd_at: workflow.rtd_at || shippedAt,
      medusa_fulfillment_id: fulfillment_id,
      medusa_shipped_at: shippedAt,
      shiprocket_status: workflow.shiprocket_status || "shipped",
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
      },
    })
  } catch (error: any) {
    console.error("Vendor order RTD error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to mark ready to dispatch / ship",
    })
  }
}

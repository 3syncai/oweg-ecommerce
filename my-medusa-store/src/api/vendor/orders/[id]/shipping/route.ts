import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import ShiprocketService from "../../../../../services/shiprocket"
import {
  buildShiprocketForwardPayload,
  formatVendorOrder,
  getVendorOrderOrRespond,
  getVendorWorkflow,
  pickVendorItems,
  setVendorOrderCorsHeaders,
  updateVendorOrderWorkflow,
  type VendorShippingMethod,
} from "../../../../../lib/vendor-order-workflow"

type ShippingBody = {
  method?: VendorShippingMethod
  courier_partner_name?: string
  tracking_source?: "shiprocket" | "carrier_api" | "manual"
  awb?: string
  tracking_id?: string
  dispatch_rate?: number | string
  packing_info?: string
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

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
    if (!workflow.accepted_at && workflow.stage !== "to_pack") {
      return res.status(409).json({ message: "Accept the order before choosing shipping" })
    }

    const body = ((req as any).body || {}) as ShippingBody
    const method = body.method
    if (method !== "easy" && method !== "self") {
      return res.status(400).json({ message: "Shipping method must be easy or self" })
    }

    let patch: Record<string, any> = {
      stage: "to_pack",
      shipping_method: method,
    }

    if (method === "easy") {
      const vendorItems = pickVendorItems(result.order, result.vendorProductIds)
      const shiprocket = new ShiprocketService()
      const response = await shiprocket.createForwardShipment(
        buildShiprocketForwardPayload(result.order, vendorItems, auth.vendor_id) as any
      )

      patch = {
        ...patch,
        shiprocket_order_id: (response as any)?.order_id || (response as any)?.data?.order_id || null,
        shiprocket_awb: (response as any)?.awb || (response as any)?.data?.awb || null,
        shiprocket_status: "created",
      }
    } else {
      const courier = String(body.courier_partner_name || "").trim()
      const awb = String(body.awb || body.tracking_id || "").trim()
      const packingInfo = String(body.packing_info || "").trim()
      const dispatchRate = Number(body.dispatch_rate || 0)

      if (!courier || !awb || !packingInfo || !Number.isFinite(dispatchRate) || dispatchRate < 0) {
        return res.status(400).json({
          message: "Courier partner, AWB/tracking id, dispatch rate, and packing info are required",
        })
      }

      patch = {
        ...patch,
        self_courier_partner: courier.slice(0, 120),
        self_tracking_source:
          body.tracking_source === "shiprocket" || body.tracking_source === "carrier_api"
            ? body.tracking_source
            : "manual",
        self_awb: awb.slice(0, 120),
        self_dispatch_rate: dispatchRate,
        self_packing_info: packingInfo.slice(0, 500),
      }
    }

    const metadata = await updateVendorOrderWorkflow(req, result.order, auth.vendor_id, patch)
    return res.json({
      order: formatVendorOrder({ ...result.order, metadata }, auth.vendor_id, result.vendorProductIds),
    })
  } catch (error: any) {
    console.error("Vendor order shipping error:", error)
    return res.status(500).json({ message: error?.message || "Failed to set shipping" })
  }
}

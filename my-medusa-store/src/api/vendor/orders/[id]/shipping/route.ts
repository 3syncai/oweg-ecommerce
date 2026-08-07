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
import { isShiprocketEligibleOrder } from "../../../../../lib/vendor-order-visibility"
import {
  ensureVendorShiprocketPickup,
  retrieveVendorOrThrow,
} from "../../../../../lib/vendor-shiprocket-pickup"
import { getKnownTrackingUrl } from "../../../../../services/self-shipping-tracking"

type ShippingBody = {
  method?: VendorShippingMethod
  courier_id?: number | string
  courier_partner_name?: string
  /** Shiprocket serviceability rate → vendor logistic fee */
  rate?: number | string
  freight_charge?: number | string
  weight?: number | string
  length?: number | string
  breadth?: number | string
  height?: number | string
  tracking_source?: "shiprocket" | "carrier_api" | "manual"
  awb?: string
  tracking_id?: string
  tracking_number?: string
  tracking_url?: string
  label_url?: string
  dispatch_rate?: number | string
  packing_info?: string
}

function cleanOptionalUrl(value: unknown, field: string): string | null {
  const raw = String(value || "").trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid")
    }
    return parsed.toString().slice(0, 500)
  } catch {
    throw new Error(`${field} must be a valid http(s) URL`)
  }
}

function cleanOptionalText(value: unknown, max = 200): string | null {
  const raw = String(value || "").trim()
  return raw ? raw.slice(0, max) : null
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
      if (!isShiprocketEligibleOrder(result.order as any)) {
        return res.status(409).json({
          message:
            "Order is not ready for Shiprocket (draft, unpaid, failed payment, or unconfirmed COD).",
        })
      }

      const courierIdRaw = body.courier_id
      const courierId =
        courierIdRaw != null && String(courierIdRaw).trim() !== ""
          ? Number(courierIdRaw)
          : NaN
      const courierName = String(body.courier_partner_name || "").trim()
      const rateRaw = body.rate != null ? Number(body.rate) : Number(body.freight_charge)
      const courierRate =
        Number.isFinite(rateRaw) && rateRaw >= 0 ? Math.round(rateRaw * 100) / 100 : 0

      if (!Number.isFinite(courierId) || courierId <= 0) {
        return res.status(400).json({
          message: "Select a courier partner (courier_id) for Easy Shipping",
        })
      }

      let trackingUrl: string | null = null
      let labelUrl: string | null = null
      try {
        trackingUrl = cleanOptionalUrl(body.tracking_url, "Tracking URL")
        labelUrl = cleanOptionalUrl(body.label_url, "Label URL")
      } catch (e: any) {
        return res.status(400).json({ message: e?.message || "Invalid URL" })
      }
      const trackingNumber = cleanOptionalText(body.tracking_number || body.tracking_id, 120)

      const vendor = await retrieveVendorOrThrow(req, auth.vendor_id)
      let vendorPickup
      try {
        vendorPickup = await ensureVendorShiprocketPickup(req, vendor)
      } catch (e: any) {
        return res.status(400).json({
          message: e?.message || "Vendor pickup address incomplete",
        })
      }

      const packageWeight = Number(body.weight)
      const packageLength = Number(body.length)
      const packageBreadth = Number(body.breadth)
      const packageHeight = Number(body.height)

      const vendorItems = pickVendorItems(result.order, result.vendorProductIds)
      const shiprocket = new ShiprocketService()
      const response = await shiprocket.createForwardShipment(
        buildShiprocketForwardPayload(result.order, vendorItems, auth.vendor_id, {
          courier_id: courierId,
          courier_name: courierName || null,
          pickup_location: vendorPickup.pickup_location,
          weight: Number.isFinite(packageWeight) && packageWeight > 0 ? packageWeight : null,
          length: Number.isFinite(packageLength) && packageLength > 0 ? packageLength : null,
          breadth: Number.isFinite(packageBreadth) && packageBreadth > 0 ? packageBreadth : null,
          height: Number.isFinite(packageHeight) && packageHeight > 0 ? packageHeight : null,
        }) as any
      )

      const shipmentId =
        (response as any)?.shipment_id ||
        (response as any)?.data?.shipment_id ||
        null
      let awb =
        (response as any)?.awb ||
        (response as any)?.awb_code ||
        (response as any)?.data?.awb ||
        null
      let assignWarning: string | null = null

      if (shipmentId && !awb) {
        try {
          const assigned = await shiprocket.assignAwb(shipmentId, courierId)
          awb =
            (assigned as any)?.response?.data?.awb_code ||
            (assigned as any)?.awb_code ||
            (assigned as any)?.awb ||
            awb
        } catch (assignError: any) {
          const msg = String(assignError?.message || "")
          console.warn("[Shiprocket] AWB assign after create failed:", msg)
          if (/KYC/i.test(msg)) {
            return res.status(400).json({
              message:
                "Shiprocket blocked AWB assignment: complete KYC on your Shiprocket account (Settings → KYC), then try Easy Shipping again.",
              shiprocket_order_id:
                (response as any)?.order_id || (response as any)?.data?.order_id || null,
              shiprocket_shipment_id: shipmentId,
              detail: msg,
            })
          }
          assignWarning = msg
        }
      }

      patch = {
        ...patch,
        shiprocket_order_id:
          (response as any)?.order_id || (response as any)?.data?.order_id || null,
        shiprocket_shipment_id: shipmentId,
        shiprocket_awb: awb,
        shiprocket_status: awb ? "awb_assigned" : "created",
        easy_courier_id: courierId,
        easy_courier_partner: courierName.slice(0, 120) || null,
        easy_courier_rate: courierRate,
        tracking_number: trackingNumber || (awb ? String(awb) : null),
        tracking_url: trackingUrl,
        label_url: labelUrl,
        easy_pickup_location: vendorPickup.pickup_location,
        easy_pickup_pincode: vendorPickup.pin_code,
        easy_package_weight:
          Number.isFinite(packageWeight) && packageWeight > 0 ? packageWeight : null,
        easy_package_length:
          Number.isFinite(packageLength) && packageLength > 0 ? packageLength : null,
        easy_package_breadth:
          Number.isFinite(packageBreadth) && packageBreadth > 0 ? packageBreadth : null,
        easy_package_height:
          Number.isFinite(packageHeight) && packageHeight > 0 ? packageHeight : null,
        easy_assign_warning: assignWarning,
      }
    } else {
      const courier = String(body.courier_partner_name || "").trim()
      const awb = String(body.awb || body.tracking_id || body.tracking_number || "").trim()
      const packingInfo = String(body.packing_info || "").trim()
      const dispatchRateRaw = body.dispatch_rate
      const dispatchRate =
        dispatchRateRaw === undefined || dispatchRateRaw === null || dispatchRateRaw === ""
          ? 0
          : Number(dispatchRateRaw)

      if (!courier || !awb || !packingInfo) {
        return res.status(400).json({
          message: "Courier partner, AWB/tracking id, and packing info are required",
        })
      }

      if (!Number.isFinite(dispatchRate) || dispatchRate < 0) {
        return res.status(400).json({
          message: "Dispatch rate must be a valid non-negative number when provided",
        })
      }

      let trackingUrl: string | null = null
      let labelUrl: string | null = null
      try {
        trackingUrl = cleanOptionalUrl(body.tracking_url, "Tracking URL")
        labelUrl = cleanOptionalUrl(body.label_url, "Label URL")
      } catch (e: any) {
        return res.status(400).json({ message: e?.message || "Invalid URL" })
      }

      // Amazon-style: auto-build a public tracking URL from courier + AWB when omitted
      if (!trackingUrl) {
        trackingUrl = getKnownTrackingUrl(courier, awb)
      }

      if (body.tracking_source === "manual" && !trackingUrl) {
        return res.status(400).json({
          message: "Tracking URL is required when booked through Manual tracking link only",
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
        tracking_number: awb.slice(0, 120),
        tracking_url: trackingUrl,
        label_url: labelUrl,
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

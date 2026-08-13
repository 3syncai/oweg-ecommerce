import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import {
  getReturnMetadata,
  isVendorSelfShipOrder,
  resolveVendorOwnedReturn,
} from "../../../../../lib/vendor-return-shiprocket"
import { syncOrderReturnMetadata } from "../../../../../services/sync-order-return-metadata"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.VENDOR_CORS || "http://localhost:4000"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

type Body = {
  tracking_number?: string
  tracking_url?: string
  label_url?: string
  courier_partner?: string
}

/**
 * POST /vendor/returns/:id/self-tracking
 * Self-ship original order → vendor adds reverse tracking so admin can see it.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const returnId = req.params?.id as string
  if (!returnId) return res.status(400).json({ message: "Return id is required" })

  const body = (req.body || {}) as Body
  const trackingNumber = String(body.tracking_number || "").trim().slice(0, 120)
  const trackingUrl = String(body.tracking_url || "").trim().slice(0, 500)
  const labelUrl = String(body.label_url || "").trim().slice(0, 500)
  const courierPartner = String(body.courier_partner || "").trim().slice(0, 120)

  if (!courierPartner || !trackingNumber || !trackingUrl) {
    return res.status(400).json({
      message: "Courier partner, tracking ID (AWB), and tracking URL are all required",
    })
  }

  try {
    const resolved = await resolveVendorOwnedReturn(req, auth.vendor_id, returnId)
    if ("error" in resolved && resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message })
    }

    const { request, order, returnService } = resolved

    if (!isVendorSelfShipOrder(order, auth.vendor_id)) {
      return res.status(400).json({
        message:
          "Self tracking is only for Self Ship orders. Use Shiprocket reverse service for Easy Ship.",
      })
    }

    const status = String(request.status || "")
    if (
      !["pending_approval", "approved", "pickup_initiated", "picked_up"].includes(status)
    ) {
      return res.status(400).json({
        message: "Tracking can only be added while the return is active",
      })
    }

    const meta = getReturnMetadata(request)
    const savedAt = new Date().toISOString()
    const updated = await returnService.updateReturnRequests({
      id: request.id,
      // Mirror AWB onto the standard field so admin lists already showing AWB pick it up
      shiprocket_awb: trackingNumber,
      shiprocket_status: request.shiprocket_status || "self_return_booked",
      metadata: {
        ...meta,
        reverse_shipping_method: "self",
        reverse_vendor_id: auth.vendor_id,
        reverse_courier_partner: courierPartner,
        reverse_tracking_number: trackingNumber,
        reverse_tracking_url: trackingUrl,
        reverse_label_url: labelUrl || meta.reverse_label_url || null,
        reverse_tracking_saved_at: savedAt,
      },
    })

    if (request.order_id) {
      await syncOrderReturnMetadata(req.scope, request.order_id, {
        id: updated.id || request.id,
        type: updated.type || request.type,
        status: updated.status || request.status,
        reason: updated.reason ?? request.reason,
        created_at: updated.created_at || request.created_at,
      })
    }

    return res.json({
      return_request: updated,
      self_tracking: {
        tracking_number: trackingNumber || null,
        tracking_url: trackingUrl || null,
        label_url: labelUrl || null,
        courier_partner: courierPartner || null,
        saved_at: savedAt,
      },
    })
  } catch (error: any) {
    console.error("[Vendor return self-tracking] error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to save return tracking",
    })
  }
}

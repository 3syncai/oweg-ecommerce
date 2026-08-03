import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Pool } from "pg"
import { requireApprovedVendor } from "../../../_lib/guards"
import {
  getReturnMetadata,
  initiateEasyShipReversePickup,
  isVendorEasyShipOrder,
  resolveVendorOwnedReturn,
} from "../../../../../lib/vendor-return-shiprocket"
import {
  getVendorWorkflow,
  mergeVendorWorkflowMetadata,
} from "../../../../../lib/vendor-order-workflow"
import { applyVendorReturnCourierFee } from "../../../../../lib/vendor-earnings"

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
  courier_id?: number | string
  courier_name?: string
  rate?: number | string
  freight_charge?: number | string
}

/**
 * POST /vendor/returns/:id/select-courier
 * Vendor selects Shiprocket reverse service (Easy Ship). Admin approval then auto-books pickup.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const returnId = req.params?.id as string
  if (!returnId) return res.status(400).json({ message: "Return id is required" })

  const body = (req.body || {}) as Body
  const courierId = Number(body.courier_id)
  const courierName = String(body.courier_name || "").trim()
  const rateRaw = body.rate != null ? Number(body.rate) : Number(body.freight_charge)
  const courierRate =
    Number.isFinite(rateRaw) && rateRaw >= 0 ? Math.round(rateRaw * 100) / 100 : 0

  if (!Number.isFinite(courierId) || courierId <= 0) {
    return res.status(400).json({ message: "courier_id is required" })
  }
  if (!courierName) {
    return res.status(400).json({ message: "courier_name is required" })
  }

  try {
    const resolved = await resolveVendorOwnedReturn(req, auth.vendor_id, returnId)
    if ("error" in resolved && resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message })
    }

    const { request, order, returnService } = resolved

    if (!isVendorEasyShipOrder(order, auth.vendor_id)) {
      return res.status(400).json({
        message: "Courier selection is only available for Easy Ship orders",
      })
    }

    const status = String(request.status || "")
    if (!["pending_approval", "approved"].includes(status)) {
      return res.status(400).json({
        message: "Courier can only be selected before pickup is initiated",
      })
    }
    if (request.pickup_initiated_at || request.shiprocket_order_id) {
      return res.status(400).json({
        message: "Pickup already initiated for this return",
      })
    }

    const meta = getReturnMetadata(request)
    let updated = await returnService.updateReturnRequests({
      id: request.id,
      metadata: {
        ...meta,
        reverse_shipping_method: "easy",
        reverse_courier_id: courierId,
        reverse_courier_name: courierName,
        reverse_courier_rate: courierRate,
        reverse_courier_selected_at: new Date().toISOString(),
        reverse_vendor_id: auth.vendor_id,
        reverse_pickup_destination: "vendor",
      },
    })

    // Mirror return fee onto order vendor workflow + earnings (deduct from settlement)
    try {
      const orderModuleService = req.scope.resolve(Modules.ORDER)
      const orderEntity = await orderModuleService.retrieveOrder(request.order_id)
      const existingWf = getVendorWorkflow(
        (orderEntity.metadata || {}) as Record<string, unknown>,
        auth.vendor_id
      )
      const metadata = mergeVendorWorkflowMetadata(
        (orderEntity.metadata || {}) as Record<string, unknown>,
        auth.vendor_id,
        {
          ...existingWf,
          return_courier_id: courierId,
          return_courier_name: courierName,
          return_courier_rate: courierRate,
        }
      )
      await orderModuleService.updateOrders(request.order_id, { metadata })

      const pool = new Pool({ connectionString: process.env.DATABASE_URL })
      try {
        await applyVendorReturnCourierFee(
          auth.vendor_id,
          request.order_id,
          courierRate,
          pool
        )
      } finally {
        await pool.end().catch(() => {})
      }
    } catch (feeErr) {
      console.error("[Vendor return select-courier] fee sync failed:", feeErr)
    }

    let autoPickup: { ok: boolean; message?: string } | null = null
    // If admin already approved, book reverse pickup immediately
    if (status === "approved") {
      try {
        const result = await initiateEasyShipReversePickup({
          req,
          returnRequestId: request.id,
          vendorId: auth.vendor_id,
        })
        updated = result.return_request
        autoPickup = { ok: true }
      } catch (pickupErr: any) {
        console.error("[Vendor return select-courier] auto pickup failed:", pickupErr)
        autoPickup = {
          ok: false,
          message: pickupErr?.message || "Courier saved but pickup booking failed",
        }
      }
    }

    return res.json({
      return_request: updated,
      selected: {
        courier_id: courierId,
        courier_name: courierName,
      },
      auto_pickup: autoPickup,
    })
  } catch (error: any) {
    console.error("[Vendor return select-courier] error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to save reverse courier",
    })
  }
}

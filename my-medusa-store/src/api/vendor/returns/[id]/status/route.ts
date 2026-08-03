import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import { getReturnMetadata, resolveVendorOwnedReturn } from "../../../../../lib/vendor-return-shiprocket"
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

type Action = "pickup_initiated" | "picked_up" | "received"

/**
 * POST /vendor/returns/:id/status
 * Body: { action: "pickup_initiated" | "picked_up" | "received" }
 * Testing / self-ship progress: pickup → picked up → delivered to vendor.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const returnId = req.params?.id as string
  if (!returnId) return res.status(400).json({ message: "Return id is required" })

  const action = String((req.body as { action?: string })?.action || "").trim() as Action
  if (!["pickup_initiated", "picked_up", "received"].includes(action)) {
    return res.status(400).json({
      message: 'action must be "pickup_initiated", "picked_up", or "received"',
    })
  }

  try {
    const resolved = await resolveVendorOwnedReturn(req, auth.vendor_id, returnId)
    if ("error" in resolved && resolved.error) {
      return res.status(resolved.error.status).json({ message: resolved.error.message })
    }

    const { request, returnService } = resolved
    const status = String(request.status || "")
    const meta = getReturnMetadata(request)
    const nowIso = new Date().toISOString()

    let updated: any

    if (action === "pickup_initiated") {
      if (!["approved", "pending_approval"].includes(status) && status !== "pickup_initiated") {
        return res.status(400).json({
          message: `Cannot mark pickup initiated from status "${status}"`,
        })
      }
      if (status === "pickup_initiated") {
        updated = request
      } else {
        updated = await returnService.markPickupInitiated(request.id)
        updated = await returnService.updateReturnRequests({
          id: request.id,
          metadata: {
            ...meta,
            reverse_vendor_id: auth.vendor_id,
            reverse_pickup_initiated_by: "vendor",
            reverse_pickup_initiated_at: nowIso,
          },
          shiprocket_status: request.shiprocket_status || "pickup_scheduled",
        })
      }
    } else if (action === "picked_up") {
      if (!["approved", "pickup_initiated", "picked_up"].includes(status)) {
        return res.status(400).json({
          message: `Cannot mark picked up from status "${status}"`,
        })
      }
      if (status !== "picked_up" && status !== "received") {
        if (status === "approved") {
          await returnService.markPickupInitiated(request.id)
        }
        updated = await returnService.markPickedUp(request.id)
      } else {
        updated = request
      }
      updated = await returnService.updateReturnRequests({
        id: request.id,
        metadata: {
          ...getReturnMetadata(updated),
          reverse_vendor_id: auth.vendor_id,
          reverse_picked_up_by: "vendor",
          reverse_picked_up_at: nowIso,
        },
        shiprocket_status: "picked_up",
      })
    } else {
      // received = delivered to vendor
      if (!["approved", "pickup_initiated", "picked_up", "received"].includes(status)) {
        return res.status(400).json({
          message: `Cannot mark delivered to vendor from status "${status}"`,
        })
      }
      if (status === "approved") {
        await returnService.markPickupInitiated(request.id)
        await returnService.markPickedUp(request.id)
      } else if (status === "pickup_initiated") {
        await returnService.markPickedUp(request.id)
      }
      if (status !== "received") {
        updated = await returnService.markReceived(request.id)
      } else {
        updated = request
      }
      updated = await returnService.updateReturnRequests({
        id: request.id,
        metadata: {
          ...getReturnMetadata(updated),
          reverse_vendor_id: auth.vendor_id,
          returned_to_vendor: true,
          returned_to_vendor_at: nowIso,
          reverse_received_by: "vendor",
        },
        shiprocket_status: "delivered",
      })
    }

    // Re-read latest
    const latestList = await returnService.listReturnRequests({ id: request.id })
    const latest = latestList?.[0] || updated

    if (request.order_id) {
      await syncOrderReturnMetadata(req.scope, request.order_id, {
        id: latest.id,
        type: latest.type,
        status: latest.status,
        reason: latest.reason,
        created_at: latest.created_at,
      })

      // Extra order flags when parcel is back with vendor
      if (action === "received" || latest.status === "received") {
        try {
          const { Modules } = await import("@medusajs/framework/utils")
          const orderModuleService = req.scope.resolve(Modules.ORDER) as any
          const order = await orderModuleService.retrieveOrder(request.order_id)
          const existing = (order.metadata || {}) as Record<string, unknown>
          await orderModuleService.updateOrders(request.order_id, {
            metadata: {
              ...existing,
              return_request_id: latest.id,
              return_request_status: latest.status,
              returned_to_vendor: true,
              returned_to_vendor_at: nowIso,
              return_status_updated_at: nowIso,
            },
          })
        } catch (metaErr) {
          console.error("[Vendor return status] order metadata sync failed:", metaErr)
        }
      }
    }

    return res.json({
      return_request: latest,
      action,
      message:
        action === "received"
          ? "Marked delivered — returned to vendor"
          : action === "picked_up"
            ? "Marked picked up"
            : "Marked pickup initiated",
    })
  } catch (error: any) {
    console.error("[Vendor return status] error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to update return status",
    })
  }
}

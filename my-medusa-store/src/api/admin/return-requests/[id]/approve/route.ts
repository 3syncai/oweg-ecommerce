import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Pool } from "pg"
import ReturnModuleService from "../../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../../modules/returns"
import { syncOrderReturnMetadata } from "../../../../../services/sync-order-return-metadata"
import { reverseVendorEarningsForOrder } from "../../../../../lib/vendor-earnings"
import {
  getReverseCourierSelection,
  initiateEasyShipReversePickup,
  isVendorEasyShipOrder,
  resolveReturnVendorId,
} from "../../../../../lib/vendor-return-shiprocket"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const adminId = (req as any).auth_context?.actor_id || null
  const request = await returnService.approveReturnRequest(id, adminId)

  if (request?.order_id) {
    await syncOrderReturnMetadata(req.scope, request.order_id, {
      id: request.id,
      type: request.type,
      status: request.status,
      reason: request.reason,
      created_at: request.created_at,
    })

    // Approved return → reverse vendor settlement (was ON_HOLD after customer request)
    if (process.env.DATABASE_URL) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL })
      try {
        await reverseVendorEarningsForOrder(request.order_id, pool, "return_approved")
      } catch (err) {
        console.error("[return-approve] Failed to reverse vendor earnings:", err)
      } finally {
        await pool.end().catch(() => undefined)
      }
    }
  }

  // Trigger wallet coin reversal immediately on approval (as requested)
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    const webhookSecret = process.env.MEDUSA_WEBHOOK_SECRET
    const internalApiSecret = process.env.INTERNAL_API_SECRET

    if (request?.order_id) {
      await fetch(`${baseUrl}/api/webhooks/order-cancelled`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
        },
        body: JSON.stringify({
          event: "order.return_approved",
          data: {
            id: request.order_id,
            status: "return_approved",
          },
        }),
      })

      await fetch(`${baseUrl}/api/store/wallet/refund-coin-discount-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalApiSecret ? { "x-internal-api-secret": internalApiSecret } : {}),
        },
        body: JSON.stringify({ order_id: request.order_id, reason: "return" }),
      })
    }
  } catch (err) {
    console.error("[return-approve] Failed to trigger coin reversal webhook:", err)
  }

  // Easy Ship: if vendor already selected a reverse courier, book pickup to vendor address
  let autoPickup: { ok: boolean; message?: string; shiprocket?: any } | null = null
  let latestRequest = request
  try {
    const refreshed = await returnService.listReturnRequests({ id })
    latestRequest = refreshed?.[0] || request

    if (latestRequest?.order_id) {
      const order = await orderModuleService.retrieveOrder(latestRequest.order_id, {
        relations: ["items", "shipping_address", "billing_address"],
      })
      const vendorId = await resolveReturnVendorId(req, order)
      const selection = getReverseCourierSelection(latestRequest)

      if (
        vendorId &&
        selection &&
        isVendorEasyShipOrder(order, vendorId) &&
        !latestRequest.pickup_initiated_at &&
        !latestRequest.shiprocket_order_id
      ) {
        const result = await initiateEasyShipReversePickup({
          req,
          returnRequestId: latestRequest.id,
          vendorId,
        })
        autoPickup = { ok: true, shiprocket: result.shiprocket }
        const afterPickup = await returnService.listReturnRequests({ id })
        return res.json({
          return_request: afterPickup[0] || result.return_request,
          auto_pickup: autoPickup,
        })
      }

      if (vendorId && isVendorEasyShipOrder(order, vendorId) && !selection) {
        autoPickup = {
          ok: false,
          message:
            "Approved. Waiting for vendor to select a Shiprocket reverse service before pickup.",
        }
      }
    }
  } catch (err: any) {
    console.error("[return-approve] Easy Ship auto pickup failed:", err)
    autoPickup = {
      ok: false,
      message: err?.message || "Auto reverse pickup failed after approval",
    }
  }

  return res.json({ return_request: latestRequest, auto_pickup: autoPickup })
}

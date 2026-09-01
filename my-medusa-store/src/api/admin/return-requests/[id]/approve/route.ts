import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Pool } from "pg"
import ReturnModuleService from "../../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../../modules/returns"
import { syncOrderReturnMetadata } from "../../../../../services/sync-order-return-metadata"
import { reverseVendorEarningsForOrder } from "../../../../../lib/vendor-earnings"
import {
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

  // Easy Ship returns: admin books reverse pickup via Return Packet Booking (no auto-book here)
  let bookingNote: { ok: boolean; message?: string } | null = null
  let latestRequest = request
  try {
    const refreshed = await returnService.listReturnRequests({ id })
    latestRequest = refreshed?.[0] || request

    if (latestRequest?.order_id) {
      const order = await orderModuleService.retrieveOrder(latestRequest.order_id, {
        relations: ["items", "shipping_address", "billing_address"],
      })
      const vendorId = await resolveReturnVendorId(req, order, latestRequest)

      if (vendorId && isVendorEasyShipOrder(order, vendorId)) {
        bookingNote = {
          ok: true,
          message: "Approved. Book return pickup next.",
        }
        return res.json({
          return_request: latestRequest,
          auto_pickup: bookingNote,
          redirect_to: `/app/return-packet-booking?return_id=${latestRequest.id}`,
          is_easy_ship_return: true,
        })
      }
    }
  } catch (err: any) {
    console.error("[return-approve] Easy Ship booking note failed:", err)
  }

  return res.json({ return_request: latestRequest, auto_pickup: bookingNote })
}

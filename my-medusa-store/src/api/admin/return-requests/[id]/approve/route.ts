import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Pool } from "pg"
import ReturnModuleService from "../../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../../modules/returns"
import { syncOrderReturnMetadata } from "../../../../../services/sync-order-return-metadata"
import {
  listVendorIdsForReturnRequest,
  holdVendorEarningsForReturn,
} from "../../../../../lib/vendor-earnings"
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

  }

  // Approval reserves the affected vendor balance. Cash and coins settle only
  // when an operator acknowledges the manual payout after receipt.
  if(request?.order_id && process.env.DATABASE_URL) {
    const pool=new Pool({connectionString:process.env.DATABASE_URL})
    try {const vendorIds=await listVendorIdsForReturnRequest(pool,id)
      await holdVendorEarningsForReturn(request.order_id,pool,{vendorIds})
    } finally {await pool.end()}
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

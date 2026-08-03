import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes } from "@medusajs/framework/utils"
import { Pool } from "pg"
import ReturnModuleService from "../../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../../modules/returns"
import { syncOrderReturnMetadata } from "../../../../../services/sync-order-return-metadata"
import { creditVendorEarningsAfterReturnRejected } from "../../../../../lib/vendor-earnings"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const reason = (req.body as { reason?: string })?.reason
  if (!reason) {
    throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Rejection reason is required.")
  }

  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const adminId = (req as any).auth_context?.actor_id || null
  const request = await returnService.rejectReturnRequest(id, reason, adminId)

  if (request?.order_id) {
    await syncOrderReturnMetadata(req.scope, request.order_id, {
      id: request.id,
      type: request.type,
      status: request.status,
      reason: request.reason,
      created_at: request.created_at,
    })

    // Return rejected → credit settlement to Pending Payment
    if (process.env.DATABASE_URL) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL })
      try {
        await creditVendorEarningsAfterReturnRejected(request.order_id, pool)
      } catch (err) {
        console.error("[return-reject] Failed to credit vendor earnings:", err)
      } finally {
        await pool.end().catch(() => undefined)
      }
    }
  }

  return res.json({ return_request: request })
}

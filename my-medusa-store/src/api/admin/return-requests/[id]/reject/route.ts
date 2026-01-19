import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes } from "@medusajs/framework/utils"
import ReturnModuleService from "../../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../../modules/returns"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const reason = (req.body as { reason?: string })?.reason
  if (!reason) {
    throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Rejection reason is required.")
  }

  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const adminId = (req as any).auth_context?.actor_id || null
  const request = await returnService.rejectReturnRequest(id, reason, adminId)
  return res.json({ return_request: request })
}

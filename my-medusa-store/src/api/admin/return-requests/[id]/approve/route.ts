import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import ReturnModuleService from "../../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../../modules/returns"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const adminId = (req as any).auth_context?.actor_id || null
  const request = await returnService.approveReturnRequest(id, adminId)
  return res.json({ return_request: request })
}

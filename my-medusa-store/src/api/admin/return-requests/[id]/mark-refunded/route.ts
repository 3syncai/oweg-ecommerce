import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import ReturnModuleService from "../../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../../modules/returns"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const requests = await returnService.listReturnRequests({ id })
  if (!requests.length) {
    return res.status(404).json({ message: "Return request not found." })
  }
  const request = requests[0]
  if (request.status !== "picked_up") {
    return res.status(400).json({ message: "Refund can be marked only after pickup." })
  }
  const updated = await returnService.markRefunded(id)
  return res.json({ return_request: updated })
}

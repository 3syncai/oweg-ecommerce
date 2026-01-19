import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import ReturnModuleService from "../../../modules/returns/service"
import { RETURN_MODULE } from "../../../modules/returns"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const requests = await returnService.listReturnRequests({})

  const requestIds = new Set(requests.map((request: any) => request.id))
  const items = requestIds.size ? await returnService.listReturnRequestItems({}) : []

  const itemsByRequest = new Map<string, any[]>()
  for (const item of items) {
    if (!requestIds.has(item.return_request_id)) {
      continue
    }
    const list = itemsByRequest.get(item.return_request_id) || []
    list.push(item)
    itemsByRequest.set(item.return_request_id, list)
  }

  const enriched = requests.map((request: any) => ({
    ...request,
    items: itemsByRequest.get(request.id) || [],
  }))

  return res.json({ return_requests: enriched })
}

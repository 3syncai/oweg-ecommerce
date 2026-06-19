import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import ReturnModuleService from "../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../modules/returns"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const requests = await returnService.listReturnRequests({})

  const byOrder = new Map<string, { type: string; status: string; reason?: string | null; created_at?: string | Date | null }>()
  for (const request of requests) {
    if (!request?.order_id) continue
    const existing = byOrder.get(request.order_id)
    const requestTime = new Date(request.created_at || 0).getTime()
    const existingTime = existing ? new Date(existing.created_at || 0).getTime() : 0
    if (!existing || requestTime >= existingTime) {
      byOrder.set(request.order_id, {
        type: request.type,
        status: request.status,
        reason: request.reason,
        created_at: request.created_at,
      })
    }
  }

  return res.json({
    orders: Object.fromEntries(byOrder.entries()),
  })
}

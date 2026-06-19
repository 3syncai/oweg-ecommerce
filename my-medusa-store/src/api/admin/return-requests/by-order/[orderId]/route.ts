import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import ReturnModuleService from "../../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../../modules/returns"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.orderId
  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" })
  }

  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const requests = await returnService.listReturnRequests({ order_id: orderId })

  if (!requests?.length) {
    return res.json({ return_request: null })
  }

  const sorted = [...requests].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime()
    const bTime = new Date(b.created_at || 0).getTime()
    return bTime - aTime
  })

  const latest = sorted[0]
  const items = await returnService.listReturnRequestItems({ return_request_id: latest.id })

  return res.json({
    return_request: {
      ...latest,
      items,
    },
  })
}

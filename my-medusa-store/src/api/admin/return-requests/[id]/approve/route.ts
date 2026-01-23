import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import ReturnModuleService from "../../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../../modules/returns"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const adminId = (req as any).auth_context?.actor_id || null
  const request = await returnService.approveReturnRequest(id, adminId)

  // Trigger wallet coin reversal immediately on approval (as requested)
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    const webhookSecret = process.env.MEDUSA_WEBHOOK_SECRET

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
    }
  } catch (err) {
    console.error("[return-approve] Failed to trigger coin reversal webhook:", err)
  }

  return res.json({ return_request: request })
}

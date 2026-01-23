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

  // Trigger wallet coin reversal in storefront app
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    const webhookSecret = process.env.MEDUSA_WEBHOOK_SECRET

    if (request.order_id) {
      await fetch(`${baseUrl}/api/webhooks/order-cancelled`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
        },
        body: JSON.stringify({
          event: "order.refunded",
          data: {
            id: request.order_id,
            status: "refunded",
          },
        }),
      })
    }
  } catch (err) {
    console.error("[return-refund] Failed to trigger coin reversal webhook:", err)
  }

  return res.json({ return_request: updated })
}

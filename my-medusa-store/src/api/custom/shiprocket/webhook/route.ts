import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import ReturnModuleService from "../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../modules/returns"

function normalizeStatus(status: string) {
  const normalized = status.trim().toLowerCase()
  if (normalized.includes("picked")) return "picked_up"
  if (normalized.includes("delivered")) return "delivered"
  if (normalized.includes("transit")) return "in_transit"
  if (normalized.includes("out for")) return "out_for_delivery"
  if (normalized.includes("pickup")) return "pickup_initiated"
  return normalized.replace(/\s+/g, "_")
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const secret = process.env.SHIPROCKET_WEBHOOK_SECRET
  if (secret) {
    const headerSecret =
      (req.headers["x-shiprocket-webhook-secret"] as string | undefined) ||
      (req.headers["x-shiprocket-signature"] as string | undefined)
    if (!headerSecret || headerSecret !== secret) {
      return res.status(401).json({ message: "Unauthorized" })
    }
  }

  const payload = req.body as any
  console.log("[Shiprocket] Webhook payload received")
  const statusRaw =
    payload?.current_status ||
    payload?.status ||
    payload?.data?.current_status ||
    payload?.data?.status ||
    ""
  const status = normalizeStatus(String(statusRaw || ""))
  const awb = payload?.awb || payload?.data?.awb
  const shiprocketOrderId = payload?.order_id || payload?.data?.order_id
  console.log(`[Shiprocket] Webhook status=${status} awb=${awb} order_id=${shiprocketOrderId}`)

  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const orderModuleService = req.scope.resolve(Modules.ORDER)

  let updatedReturn: any = null

  if (awb) {
    const requests = await returnService.listReturnRequests({ shiprocket_awb: String(awb) })
    if (requests.length) {
      const request = requests[0]
      console.log(`[Return] Webhook matched return ${request.id}`)
      if (status === "picked_up") {
        await returnService.markPickedUp(request.id)
      } else if (status === "delivered") {
        await returnService.markReceived(request.id)
      } else {
        await returnService.updateReturnRequests({
          id: request.id,
          status,
          shiprocket_status: status,
        })
      }
      console.log(`[Return] Updated return ${request.id} with status ${status}`)
      updatedReturn = request
    }
  }

  if (!updatedReturn && shiprocketOrderId) {
    const orders = await orderModuleService.listOrders({})
    const match = orders.find((order: any) => {
      const metadata = order.metadata || {}
      return metadata.shiprocket_order_id === shiprocketOrderId || metadata.shiprocket_awb === awb
    })
    if (match) {
      console.log(`[Order] Webhook matched order ${match.id}`)
      const metadata = match.metadata || {}
      const updates: any = {
        shiprocket_status: status,
      }
      if (status === "delivered") {
        updates.shiprocket_delivered_at = new Date().toISOString()
      }
      await orderModuleService.updateOrders(match.id, {
        metadata: {
          ...metadata,
          ...updates,
        },
      })
      console.log(`[Order] Updated order ${match.id} metadata with status ${status}`)
    }
  }

  return res.json({ received: true })
}

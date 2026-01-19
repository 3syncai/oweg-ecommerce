import { cancelOrderWorkflow } from "@medusajs/core-flows"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes, Modules } from "@medusajs/framework/utils"
import ShiprocketService from "../../../../../services/shiprocket"

const BLOCKED_SHIPROCKET = new Set([
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
])

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as MedusaRequest & {
    auth_context?: { actor_id?: string }
  }).auth_context

  if (!authContext?.actor_id) {
    throw new MedusaError(MedusaErrorTypes.UNAUTHORIZED, "Customer authentication required.")
  }

  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const order = await orderModuleService.retrieveOrder(req.params.id, {
    relations: ["items", "shipping_address", "billing_address"],
  })

  const orderCustomerId = order?.customer_id || order?.customer?.id
  if (orderCustomerId !== authContext.actor_id) {
    throw new MedusaError(MedusaErrorTypes.UNAUTHORIZED, "Order does not belong to customer.")
  }

  const metadata = order.metadata || {}
  const shiprocketStatus = String((metadata as any).shiprocket_status || "").toLowerCase()
  const fulfillment = String(order?.fulfillment_status || "").toLowerCase()

  if (BLOCKED_SHIPROCKET.has(shiprocketStatus) || fulfillment === "shipped" || fulfillment === "delivered") {
    throw new MedusaError(
      MedusaErrorTypes.NOT_ALLOWED,
      "Order already shipped. Please use return after delivery."
    )
  }

  const shiprocketOrderId = (metadata as any).shiprocket_order_id
  if (shiprocketOrderId) {
    try {
      const shiprocket = new ShiprocketService()
      await shiprocket.cancelOrders([String(shiprocketOrderId)])
      await orderModuleService.updateOrders({
        id: order.id,
        metadata: {
          ...metadata,
          shiprocket_status: "cancelled",
        },
      })
    } catch (error: any) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        error?.message || "Shiprocket cancellation failed."
      )
    }
  }

  await cancelOrderWorkflow(req.scope).run({
    input: {
      order_id: order.id,
      canceled_by: authContext.actor_id,
    },
  })

  return res.json({ success: true })
}

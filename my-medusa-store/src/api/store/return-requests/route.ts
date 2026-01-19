import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes, Modules } from "@medusajs/framework/utils"
import ReturnModuleService from "../../../modules/returns/service"
import { RETURN_MODULE } from "../../../modules/returns"
import { StoreCreateReturnRequest } from "./validators"

function resolveDeliveryDate(order: any) {
  const metaDate = order?.metadata?.shiprocket_delivered_at
  if (metaDate) {
    const delivered = new Date(metaDate)
    return !isNaN(delivered.getTime()) ? delivered : null
  }

  if (order?.delivered_at) {
    const delivered = new Date(order.delivered_at)
    return !isNaN(delivered.getTime()) ? delivered : null
  }

  const fulfillment = String(order?.fulfillment_status || "").toLowerCase()
  if (fulfillment === "delivered") {
    const fallback = order?.updated_at || order?.created_at
    if (fallback) {
      const delivered = new Date(fallback)
      return !isNaN(delivered.getTime()) ? delivered : null
    }
  }

  // Fallback for stores not exposing fulfillment status in module retrieval
  if (!fulfillment && order?.updated_at) {
    const delivered = new Date(order.updated_at)
    return !isNaN(delivered.getTime()) ? delivered : null
  }

  return null
}

function getPaymentType(order: any, hasBankDetails: boolean) {
  const metadata = order?.metadata || {}
  const method = String(metadata.payment_method || metadata.payment_type || "").toLowerCase()
  if (method.includes("cod") || method.includes("cash")) {
    return "cod"
  }
  if (hasBankDetails) {
    return "cod"
  }
  return "online"
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as MedusaRequest & {
    auth_context?: { actor_id?: string }
  }).auth_context

  if (!authContext?.actor_id) {
    throw new MedusaError(MedusaErrorTypes.UNAUTHORIZED, "Customer authentication required.")
  }

  const body = StoreCreateReturnRequest.parse(req.body)
  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)

  const order = await orderModuleService.retrieveOrder(body.order_id, {
    relations: ["items", "shipping_address", "billing_address"],
  })

  console.log("[Return] Order status check", {
    order_id: order?.id,
    status: order?.status,
    payment_status: order?.payment_status,
    fulfillment_status: order?.fulfillment_status,
    delivered_at: order?.delivered_at,
    updated_at: order?.updated_at,
    created_at: order?.created_at,
    shiprocket_delivered_at: order?.metadata?.shiprocket_delivered_at,
  })

  const orderCustomerId = order?.customer_id || order?.customer?.id
  if (orderCustomerId !== authContext.actor_id) {
    throw new MedusaError(MedusaErrorTypes.UNAUTHORIZED, "Order does not belong to customer.")
  }

  const deliveredAt = resolveDeliveryDate(order)
  console.log("[Return] Resolved delivery date", {
    order_id: order?.id,
    delivered_at: deliveredAt?.toISOString() || null,
  })
  if (!deliveredAt) {
    throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Return window has not started yet.")
  }

  const now = new Date()
  const diffMs = now.getTime() - deliveredAt.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays > 7) {
    throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Return window has expired.")
  }

  const orderItems = order?.items || []
  const itemMap = new Map(orderItems.map((item: any) => [item.id, item]))
  for (const item of body.items) {
    const match = itemMap.get(item.order_item_id)
    if (!match) {
      throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Invalid order item.")
    }
    if (item.quantity > (match.quantity || 0)) {
      throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Invalid return quantity.")
    }
  }

  const paymentType = getPaymentType(order, Boolean(body.bank_details)) as "online" | "cod"
  const refundMethod = paymentType === "cod" ? "bank" : "original"

  const request = await returnService.createReturnRequest({
    order_id: body.order_id,
    customer_id: authContext.actor_id,
    type: body.type,
    reason: body.reason ?? null,
    notes: body.notes ?? null,
    payment_type: paymentType,
    refund_method: refundMethod,
    bank_details: body.bank_details ?? null,
    items: body.items,
  })

  return res.status(200).json({ return_request: request })
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const authContext = (req as MedusaRequest & {
    auth_context?: { actor_id?: string }
  }).auth_context

  if (!authContext?.actor_id) {
    throw new MedusaError(MedusaErrorTypes.UNAUTHORIZED, "Customer authentication required.")
  }

  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const requests = await returnService.listReturnRequests({
    customer_id: authContext.actor_id,
  })

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

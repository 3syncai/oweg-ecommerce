import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, MedusaErrorTypes, Modules } from "@medusajs/framework/utils"
import { Pool } from "pg"
import ReturnModuleService from "../../../modules/returns/service"
import { RETURN_MODULE } from "../../../modules/returns"
import { StoreCreateReturnRequest } from "./validators"
import { syncOrderReturnMetadata } from "../../../services/sync-order-return-metadata"
import {
  holdVendorEarningsForReturn,
  listVendorIdsForReturnRequest,
} from "../../../lib/vendor-earnings"

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

function getPaymentType(order: any) {
  const metadata = order?.metadata || {}
  const method = String(metadata.payment_method || metadata.payment_type || "").toLowerCase()
  if (method.includes("cod") || method.includes("cash")) {
    return "cod"
  }
  return "online"
}

function getProductPolicyWindow(metadata: Record<string, any> | null | undefined, type: string) {
  // Products created before this feature retain the existing 7-day policy.
  if (metadata?.return_replacement_policy_configured !== true) return 7

  const value = type === "replacement"
    ? metadata.replacement_window_days
    : metadata.return_window_days
  const days = Number(value)
  return Number.isInteger(days) && days >= 0 && days <= 365 ? days : 0
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

  const orderAny = order as any
  console.log("[Return] Order status check", {
    order_id: order?.id,
    status: order?.status,
    payment_status: orderAny?.payment_status,
    fulfillment_status: orderAny?.fulfillment_status,
    delivered_at: orderAny?.delivered_at,
    updated_at: order?.updated_at,
    created_at: order?.created_at,
    shiprocket_delivered_at: order?.metadata?.shiprocket_delivered_at,
  })

  const orderCustomerId = order?.customer_id || orderAny?.customer?.id
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

  // Apply the return/replacement policy of each selected product. An order can
  // contain products with different vendor-configured windows, so every item
  // must still be eligible for the requested action.
  const variantIds = [...new Set(
    body.items
      .map((item) => itemMap.get(item.order_item_id)?.variant_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  )]
  if (variantIds.length === 0) {
    // Preserve the previous protection for legacy order items that do not
    // expose a variant reference.
    if (diffDays > 7) {
      throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Return window has expired.")
    }
  } else {
    const knex = req.scope.resolve("__pg_connection__") as any
    const policyRows = await knex("product_variant as pv")
      .innerJoin("product as p", "p.id", "pv.product_id")
      .whereIn("pv.id", variantIds)
      .select("pv.id as variant_id", "p.metadata as product_metadata")
    const metadataByVariant = new Map<string, Record<string, any>>()
    for (const row of policyRows) {
      metadataByVariant.set(String(row.variant_id), row.product_metadata || {})
    }

    for (const variantId of variantIds) {
      const windowDays = getProductPolicyWindow(metadataByVariant.get(variantId), body.type)
      const label = body.type === "replacement" ? "Replacement" : "Return"
      if (windowDays <= 0) {
        throw new MedusaError(
          MedusaErrorTypes.INVALID_DATA,
          `${label} is not available for this item.`
        )
      }
      if (diffDays > windowDays) {
        throw new MedusaError(
          MedusaErrorTypes.INVALID_DATA,
          `${label} window has expired for this item.`
        )
      }
    }
  }

  const paymentType = getPaymentType(order) as "online" | "cod"
  const refundPayout =
    body.refund_payout ||
    (body.bank_details
      ? {
          method: "bank" as const,
          account_name: body.bank_details.account_name,
          account_number: body.bank_details.account_number,
          ifsc_code: body.bank_details.ifsc_code,
          bank_name: body.bank_details.bank_name,
        }
      : null)

  const refundMethod =
    body.type === "return"
      ? refundPayout?.method === "upi"
        ? "upi"
        : "bank"
      : null

  const request = await returnService.createReturnRequest({
    order_id: body.order_id,
    customer_id: authContext.actor_id,
    type: body.type,
    reason: body.reason ?? null,
    notes: body.notes ?? null,
    payment_type: paymentType,
    refund_method: refundMethod,
    bank_details: body.bank_details ?? null,
    refund_payout: refundPayout,
    items: body.items,
  })

  await syncOrderReturnMetadata(req.scope, body.order_id, {
    id: request.id,
    type: request.type,
    status: request.status,
    reason: request.reason,
    created_at: request.created_at,
  })

  // Pause unlock only for vendors whose items are on this return
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const vendorIds = await listVendorIdsForReturnRequest(pool, request.id)
      const result = await holdVendorEarningsForReturn(body.order_id, pool, {
        vendorIds,
      })
      if (result.skipped_unscoped) {
        console.error(
          `[Return] No vendor ids on return ${request.id}; earnings not held`
        )
      }
    } catch (err) {
      console.error("[Return] Failed to hold vendor earnings:", err)
    } finally {
      await pool.end().catch(() => undefined)
    }
  }

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

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { markOrderFulfillmentAsDeliveredWorkflow } from "@medusajs/medusa/core-flows"
import { Pool } from "pg"
import {
  deriveVendorStage,
  getVendorWorkflow,
  getVendorWorkflows,
  mergeVendorWorkflowMetadata,
  pickVendorItems,
} from "../../../../../lib/vendor-order-workflow"
import { scheduleVendorEarningsOnDelivery } from "../../../../../lib/vendor-earnings"

type Body = {
  vendor_id?: string
  /** When true, skip Medusa fulfillment mark-as-delivered (metadata sync only) */
  metadata_only?: boolean
}

/**
 * POST /admin/orders/:id/mark-delivered
 * Admin marks order (or one vendor slice) as delivered:
 * - Medusa fulfillments → delivered (if not already)
 * - vendor_order_workflows → stage delivered
 * - schedules vendor earnings unlock
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params?.id as string
  if (!orderId) {
    return res.status(400).json({ message: "Order id is required" })
  }

  const body = (req.body || {}) as Body
  const targetVendorId = body.vendor_id ? String(body.vendor_id).trim() : null
  const metadataOnly = Boolean(body.metadata_only)

  try {
    const query = req.scope.resolve("query")
    const orderModuleService = req.scope.resolve(Modules.ORDER)

    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "metadata",
        "status",
        "items.id",
        "items.product_id",
        "items.variant.product_id",
        "fulfillments.id",
        "fulfillments.shipped_at",
        "fulfillments.delivered_at",
        "fulfillments.canceled_at",
      ],
      filters: { id: orderId },
    })

    const order = data?.[0]
    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const items = Array.isArray(order.items) ? order.items : []
    const productIds = Array.from(
      new Set(
        items
          .map((item: any) => item.product_id || item.variant?.product_id)
          .filter(Boolean)
      )
    ) as string[]

    const productVendor = new Map<string, string>()
    if (productIds.length) {
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "metadata"],
        filters: { id: productIds },
      })
      for (const product of products || []) {
        const vendorId = String((product as any)?.metadata?.vendor_id || "").trim()
        if (product?.id && vendorId) productVendor.set(product.id, vendorId)
      }
    }

    const vendorProductIds = new Map<string, string[]>()
    for (const [productId, vendorId] of productVendor) {
      const list = vendorProductIds.get(vendorId) || []
      list.push(productId)
      vendorProductIds.set(vendorId, list)
    }

    const workflows = getVendorWorkflows(order.metadata as Record<string, unknown>)
    const vendorIds = Array.from(
      new Set([...Object.keys(workflows), ...vendorProductIds.keys()])
    ).filter((id) => !targetVendorId || id === targetVendorId)

    if (!vendorIds.length) {
      return res.status(400).json({
        message: targetVendorId
          ? "Vendor not found on this order"
          : "No vendor-linked products on this order",
      })
    }

    // Mark undelivered Medusa fulfillments as delivered
    const fulfillmentResults: Array<{ id: string; ok: boolean; message?: string }> = []
    if (!metadataOnly) {
      const fulfillments = (order.fulfillments || []).filter(
        (f: any) => f?.id && !f?.canceled_at && !f?.delivered_at
      )
      for (const fulfillment of fulfillments) {
        try {
          await markOrderFulfillmentAsDeliveredWorkflow(req.scope).run({
            input: {
              orderId,
              fulfillmentId: fulfillment.id,
            },
          })
          fulfillmentResults.push({ id: fulfillment.id, ok: true })
        } catch (err: any) {
          console.error(
            `[mark-delivered] fulfillment ${fulfillment.id} failed:`,
            err?.message || err
          )
          fulfillmentResults.push({
            id: fulfillment.id,
            ok: false,
            message: err?.message || "Failed to mark fulfillment delivered",
          })
        }
      }
    }

    const deliveredAt = new Date().toISOString()
    let metadata = { ...((order.metadata as Record<string, unknown>) || {}) }

    for (const vendorId of vendorIds) {
      const productIdsForVendor = vendorProductIds.get(vendorId) || []
      if (
        productIdsForVendor.length &&
        pickVendorItems(order as any, productIdsForVendor).length === 0
      ) {
        continue
      }

      const existing = getVendorWorkflow(metadata, vendorId)
      const stage = deriveVendorStage(order as any, existing)
      if (stage === "to_accept" && !existing.accepted_at) {
        // Allow admin override even if never accepted — still mark delivered
      }

      metadata = mergeVendorWorkflowMetadata(metadata, vendorId, {
        stage: "delivered",
        shiprocket_status: "delivered",
        accepted_at: existing.accepted_at || deliveredAt,
      })
    }

    metadata = {
      ...metadata,
      shiprocket_status: "delivered",
      shiprocket_delivered_at:
        (metadata as any).shiprocket_delivered_at || deliveredAt,
      admin_marked_delivered_at: deliveredAt,
    }

    await orderModuleService.updateOrders(orderId, { metadata })

    let earnings: any = null
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    try {
      earnings = await scheduleVendorEarningsOnDelivery(orderId, pool, {
        deliveredAt: new Date(deliveredAt),
      })
    } catch (earningsErr: any) {
      console.error(`[mark-delivered] earnings failed for ${orderId}:`, earningsErr)
      earnings = { error: earningsErr?.message || "Failed to schedule earnings" }
    } finally {
      await pool.end().catch(() => {})
    }

    const frontendUrl = process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_APP_URL
    if (frontendUrl) {
      try {
        await fetch(`${frontendUrl}/api/webhooks/order-delivered`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": process.env.MEDUSA_WEBHOOK_SECRET || "",
          },
          body: JSON.stringify({
            order_id: orderId,
            event: "order.delivered",
            source: "admin_mark_delivered",
          }),
        })
      } catch (webhookErr) {
        console.error(`[mark-delivered] storefront webhook failed:`, webhookErr)
      }
    }

    const refreshed = await query.graph({
      entity: "order",
      fields: [
        "id",
        "metadata",
        "fulfillments.id",
        "fulfillments.delivered_at",
        "fulfillments.shipped_at",
      ],
      filters: { id: orderId },
    })

    return res.json({
      ok: true,
      order_id: orderId,
      vendor_ids: vendorIds,
      fulfillments: fulfillmentResults,
      earnings,
      order: refreshed.data?.[0] || null,
    })
  } catch (error: any) {
    console.error("[admin mark-delivered]", error)
    return res.status(500).json({
      message: error?.message || "Failed to mark order as delivered",
    })
  }
}

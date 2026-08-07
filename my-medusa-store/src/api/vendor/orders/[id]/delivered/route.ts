import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { markOrderFulfillmentAsDeliveredWorkflow } from "@medusajs/medusa/core-flows"
import { requireApprovedVendor } from "../../../_lib/guards"
import { getSharedDbPool } from "../../../../../lib/db-pool"
import { scheduleVendorEarningsOnDelivery } from "../../../../../lib/vendor-earnings"
import {
  deriveVendorStage,
  formatVendorOrder,
  getVendorOrderOrRespond,
  getVendorWorkflow,
  setVendorOrderCorsHeaders,
  updateVendorOrderWorkflow,
} from "../../../../../lib/vendor-order-workflow"

type Body = {
  /** Optional courier POD / delivery reference / OTP note for audit */
  delivery_confirmation?: string
  pod_reference?: string
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

/**
 * POST /vendor/orders/:id/delivered
 * Self-ship only: vendor confirms delivery when In Transit
 * (fallback when carrier API doesn't auto-update to Delivered).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const orderId = req.params?.id as string
  if (!orderId) return res.status(400).json({ message: "Order id is required" })

  const body = ((req as any).body || {}) as Body
  const confirmation = String(
    body.delivery_confirmation || body.pod_reference || ""
  )
    .trim()
    .slice(0, 200)

  try {
    const result = await getVendorOrderOrRespond(req, res, auth.vendor_id, orderId)
    if (!result) return

    const workflow = getVendorWorkflow(result.order.metadata, auth.vendor_id)
    if (workflow.shipping_method !== "self") {
      return res.status(409).json({
        message:
          "Mark Delivered is only for Self Shipping. Easy Shipping updates from Shiprocket automatically.",
      })
    }

    const stage = deriveVendorStage(result.order as any, workflow)
    if (stage === "delivered" || workflow.stage === "delivered") {
      return res.json({
        order: formatVendorOrder(result.order, auth.vendor_id, result.vendorProductIds),
        already_delivered: true,
      })
    }

    if (stage !== "in_transit" && workflow.stage !== "in_transit") {
      return res.status(409).json({
        message: "Order must be In Transit before marking Delivered",
      })
    }

    const fulfillmentId = String(workflow.medusa_fulfillment_id || "")
    if (fulfillmentId) {
      const alreadyDelivered = (result.order.fulfillments || []).some(
        (f: any) => f?.id === fulfillmentId && f?.delivered_at
      )
      if (!alreadyDelivered) {
        try {
          await markOrderFulfillmentAsDeliveredWorkflow(req.scope).run({
            input: { orderId, fulfillmentId },
          })
        } catch (err: any) {
          console.warn(
            `[vendor delivered] fulfillment mark failed order=${orderId}:`,
            err?.message
          )
        }
      }
    }

    const deliveredAt = new Date().toISOString()
    const metadata = await updateVendorOrderWorkflow(req, result.order, auth.vendor_id, {
      stage: "delivered",
      shiprocket_status: "delivered",
      shiprocket_delivered_at: deliveredAt,
      ...(confirmation
        ? {
            self_delivery_confirmation: confirmation,
            self_delivered_at: deliveredAt,
          }
        : { self_delivered_at: deliveredAt }),
    } as any)

    try {
      const pool = getSharedDbPool()
      await scheduleVendorEarningsOnDelivery(orderId, pool, {
        deliveredAt: new Date(deliveredAt),
      })
    } catch (earningsErr: any) {
      console.warn(
        `[vendor delivered] earnings schedule failed order=${orderId}:`,
        earningsErr?.message
      )
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
            source: "vendor_self_ship_delivered",
          }),
        })
      } catch {
        // non-blocking
      }
    }

    return res.json({
      order: formatVendorOrder(
        { ...result.order, metadata },
        auth.vendor_id,
        result.vendorProductIds
      ),
      automated: { stage: "delivered", self_ship: true },
    })
  } catch (error: any) {
    console.error("Vendor mark delivered error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to mark order delivered",
    })
  }
}

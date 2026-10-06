import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Pool } from "pg"
import ReturnModuleService from "../../../../modules/returns/service"
import { RETURN_MODULE } from "../../../../modules/returns"
import { syncOrderReturnMetadata } from "../../../../services/sync-order-return-metadata"
import { scheduleVendorEarningsOnDelivery } from "../../../../lib/vendor-earnings"
import {
  getVendorWorkflows,
  mergeVendorWorkflowMetadata,
  resolveVendorIdFromShipmentMetadata,
} from "../../../../lib/vendor-order-workflow"

function normalizeStatus(status: string) {
  const normalized = status.trim().toLowerCase()
  if (normalized.includes("picked")) return "picked_up"
  if (normalized.includes("delivered")) return "delivered"
  if (normalized.includes("transit")) return "in_transit"
  if (normalized.includes("out for")) return "out_for_delivery"
  if (normalized.includes("pickup")) return "pickup_initiated"
  return normalized.replace(/\s+/g, "_")
}

export function verifyShiprocketWebhookSecret(req: MedusaRequest): boolean {
  const secret = process.env.SHIPROCKET_WEBHOOK_SECRET
  if (!secret) return true

  const headerSecret =
    (req.headers["x-api-key"] as string | undefined) ||
    (req.headers["x-shiprocket-webhook-secret"] as string | undefined) ||
    (req.headers["x-shiprocket-signature"] as string | undefined)

  return Boolean(headerSecret && headerSecret === secret)
}

export async function handleShiprocketWebhook(req: MedusaRequest, res: MedusaResponse) {
  const authed = verifyShiprocketWebhookSecret(req)
  if (!authed) {
    // Shiprocket's "Test Webhook" often POSTs without x-api-key. Return 200 so
    // the dashboard test passes; only process payloads when the token matches.
    console.warn("[Shiprocket] Webhook test or unauthorized request acknowledged without processing")
    return res.json({ received: true })
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
      const latest = await returnService.listReturnRequests({ id: request.id })
      updatedReturn = latest[0] || request
      if (updatedReturn?.order_id) {
        await syncOrderReturnMetadata(req.scope, updatedReturn.order_id, {
          id: updatedReturn.id,
          type: updatedReturn.type,
          status: updatedReturn.status,
          reason: updatedReturn.reason,
          created_at: updatedReturn.created_at,
        })
      }
    }
  }

  if (!updatedReturn && (shiprocketOrderId || awb)) {
    const orders = await orderModuleService.listOrders({})
    const match = orders.find((order: any) => {
      const metadata = order.metadata || {}
      if (
        (shiprocketOrderId && metadata.shiprocket_order_id === shiprocketOrderId) ||
        (awb && metadata.shiprocket_awb === awb)
      ) {
        return true
      }
      const workflows = getVendorWorkflows(metadata)
      return Object.values(workflows).some((wf) => {
        if (awb && (wf.shiprocket_awb === awb || wf.tracking_number === awb || wf.self_awb === awb)) {
          return true
        }
        if (shiprocketOrderId && String(wf.shiprocket_order_id || "") === String(shiprocketOrderId)) {
          return true
        }
        return false
      })
    })
    if (match) {
      console.log(`[Order] Webhook matched order ${match.id}`)
      const metadata = { ...(match.metadata || {}) } as Record<string, unknown>
      const vendorId = resolveVendorIdFromShipmentMetadata(metadata, {
        awb: awb ? String(awb) : null,
        shiprocketOrderId: shiprocketOrderId != null ? String(shiprocketOrderId) : null,
      })
      const deliveredAt = new Date().toISOString()
      let nextMetadata: Record<string, unknown> = {
        ...metadata,
        shiprocket_status: status,
        ...(status === "delivered" ? { shiprocket_delivered_at: deliveredAt } : {}),
      }
      if (vendorId && status === "delivered") {
        nextMetadata = mergeVendorWorkflowMetadata(nextMetadata, vendorId, {
          stage: "delivered",
          shiprocket_status: "delivered",
          shiprocket_delivered_at: deliveredAt,
        })
      }
      await orderModuleService.updateOrders(match.id, {
        metadata: nextMetadata,
      })
      console.log(
        `[Order] Updated order ${match.id} metadata with status ${status} vendor=${vendorId || "unresolved"}`
      )

      // Start vendor payout unlock only for the vendor whose shipment delivered
      if (status === "delivered") {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL })
        try {
          if (!vendorId) {
            console.warn(
              `[Order] Skipping earnings for ${match.id}: could not resolve vendor for shipment`
            )
          }
          const result = vendorId
            ? await scheduleVendorEarningsOnDelivery(match.id, pool, { vendorId })
            : { scheduled: 0, vendors: [], skipped_unscoped: true }
          console.log(`[Order] Vendor earnings scheduled for ${match.id}:`, result)
        } catch (earningsErr) {
          console.error(
            `[Order] Failed to schedule vendor earnings for ${match.id}:`,
            earningsErr
          )
        } finally {
          await pool.end().catch(() => {})
        }

        // Also notify storefront webhook (coins + earnings redundancy)
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
                order_id: match.id,
                event: "order.delivered",
                vendor_id: vendorId,
              }),
            })
          } catch (webhookErr) {
            console.error(`[Order] storefront delivery webhook failed:`, webhookErr)
          }
        }
      }
    }
  }

  return res.json({ received: true })
}

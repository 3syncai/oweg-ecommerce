import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Pool } from "pg"
import { forceDummyItlStatus, getItlMode } from "../../../../services/easy-ship"
import {
  getPaymentType,
  getVendorWorkflow,
  getVendorWorkflows,
  mergeVendorWorkflowMetadata,
  normalizeTrackingStatus,
} from "../../../../lib/vendor-order-workflow"
import {
  buildLogisticsStatusPatch,
  normalizeNdrReason,
  validateLogisticsTransition,
} from "../../../../lib/vendor-logistics-status"
import { scheduleVendorEarningsOnDelivery } from "../../../../lib/vendor-earnings"

export function verifyItlWebhookSecret(req: MedusaRequest): boolean {
  const secret = process.env.ITL_WEBHOOK_SECRET
  if (!secret) return true

  const headerSecret =
    (req.headers["x-api-key"] as string | undefined) ||
    (req.headers["x-itl-webhook-secret"] as string | undefined) ||
    (req.headers["x-itl-signature"] as string | undefined)

  return Boolean(headerSecret && headerSecret === secret)
}

export async function handleItlWebhook(req: MedusaRequest, res: MedusaResponse) {
  const authed = verifyItlWebhookSecret(req)
  if (!authed) {
    console.warn("[ITL] Webhook unauthorized — acknowledged without processing")
    return res.json({ received: true })
  }

  const payload = (req.body || {}) as any
  console.log("[ITL] Webhook payload received")

  const statusRaw =
    payload?.current_status ||
    payload?.status ||
    payload?.data?.current_status ||
    payload?.data?.status ||
    ""
  const status = normalizeTrackingStatus(String(statusRaw || ""))
  const awb = String(
    payload?.awb || payload?.awb_number || payload?.data?.awb || payload?.data?.awb_number || ""
  ).trim()
  const providerOrderId = String(
    payload?.order_id || payload?.data?.order_id || ""
  ).trim()
  const reason = normalizeNdrReason(
    payload?.reason || payload?.ndr_reason || payload?.data?.reason || payload?.data?.ndr_reason
  )

  console.log(
    `[ITL] Webhook status=${status} awb=${awb} order_id=${providerOrderId} reason=${reason || "-"}`
  )

  if (!awb && !providerOrderId) {
    return res.status(400).json({ message: "awb or order_id is required" })
  }

  const forceBypass =
    getItlMode() === "dummy" &&
    (payload?.force === true || payload?.force === "true" || payload?.force === 1)

  const orderModuleService = req.scope.resolve(Modules.ORDER)
  const orders = await orderModuleService.listOrders({}, { take: 500 })

  const match = (orders || []).find((order: any) => {
    const metadata = order.metadata || {}
    if (awb && metadata.shiprocket_awb === awb) return true
    if (providerOrderId && metadata.shiprocket_order_id === providerOrderId) return true

    const workflows = getVendorWorkflows(metadata)
    return Object.values(workflows).some((wf) => {
      if (awb && (wf.shiprocket_awb === awb || wf.tracking_number === awb)) return true
      if (providerOrderId && String(wf.shiprocket_order_id || "") === providerOrderId) return true
      return false
    })
  })

  if (!match) {
    console.warn(`[ITL] Webhook: no order matched awb=${awb} order_id=${providerOrderId}`)
    return res.json({ received: true, matched: false })
  }

  console.log(`[ITL] Webhook matched order ${match.id}`)
  const metadata = { ...(match.metadata || {}) } as Record<string, any>
  const workflows = getVendorWorkflows(metadata)
  let vendorId: string | null = null

  for (const [vid, wf] of Object.entries(workflows)) {
    const hitsAwb = awb && (wf.shiprocket_awb === awb || wf.tracking_number === awb)
    const hitsOrder =
      providerOrderId && String(wf.shiprocket_order_id || "") === providerOrderId
    if (hitsAwb || hitsOrder) {
      vendorId = vid
      break
    }
  }

  const isCod =
    getPaymentType(match as any) === "PostPaid" ||
    String(metadata.payment_method || "").toLowerCase() === "cod"

  const existingWf = vendorId ? getVendorWorkflow(metadata, vendorId) : null
  const transition = forceBypass
    ? ({ ok: true as const, status })
    : validateLogisticsTransition(status, {
        currentStatus: existingWf?.shiprocket_status || metadata.shiprocket_status,
        currentStage: existingWf?.stage || null,
        isCodOrder: isCod,
        alreadyCashCollected: Boolean(existingWf?.cod_cash_collected_at),
      })

  if (!transition.ok) {
    console.warn(`[ITL] Rejected transition for ${match.id}: ${transition.message}`)
    return res.status(409).json({
      received: true,
      matched: true,
      rejected: true,
      order_id: match.id,
      status: transition.status,
      message: transition.message,
      current_status: existingWf?.shiprocket_status || null,
      current_stage: existingWf?.stage || null,
      is_cod: isCod,
    })
  }

  if (getItlMode() === "dummy" && awb && transition.status) {
    forceDummyItlStatus(awb, transition.status, { reason })
  }

  const logistics = buildLogisticsStatusPatch({
    status: transition.status,
    reason,
    isCodOrder: isCod,
  })

  // If COD already delivered and cash comes later, keep delivered stage
  if (transition.status === "cash_collected" && vendorId) {
    const existing = getVendorWorkflow(metadata, vendorId)
    if (existing.stage === "delivered" || existing.shiprocket_status === "delivered") {
      logistics.stage = "delivered"
    }
  }

  const { should_schedule_earnings, ...patch } = logistics

  let nextMetadata = metadata
  if (vendorId) {
    nextMetadata = mergeVendorWorkflowMetadata(metadata, vendorId, patch)
  } else {
    nextMetadata = {
      ...metadata,
      shiprocket_status: patch.shiprocket_status,
      ...(patch.shiprocket_delivered_at
        ? { shiprocket_delivered_at: patch.shiprocket_delivered_at }
        : {}),
      ...(patch.cod_cash_collected_at
        ? { cod_cash_collected_at: patch.cod_cash_collected_at }
        : {}),
      ...(patch.ndr_reason ? { ndr_reason: patch.ndr_reason } : {}),
      ...(patch.rto_status ? { rto_status: patch.rto_status } : {}),
    }
  }

  await orderModuleService.updateOrders(match.id, { metadata: nextMetadata })
  console.log(
    `[ITL] Updated order ${match.id} status=${transition.status} vendor=${vendorId || "root"}`
  )

  const shouldPay =
    should_schedule_earnings ||
    (transition.status === "cash_collected" && isCod) ||
    (transition.status === "delivered" && !isCod)

  if (shouldPay) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    try {
      const result = await scheduleVendorEarningsOnDelivery(match.id, pool)
      console.log(`[ITL] Vendor earnings scheduled for ${match.id}:`, result)
    } catch (earningsErr) {
      console.error(`[ITL] Failed to schedule vendor earnings for ${match.id}:`, earningsErr)
    } finally {
      await pool.end().catch(() => {})
    }

    if (transition.status === "delivered" || transition.status === "cash_collected") {
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
              event:
                transition.status === "cash_collected"
                  ? "order.cod_collected"
                  : "order.delivered",
              status: transition.status,
            }),
          })
        } catch (webhookErr) {
          console.error(`[ITL] storefront delivery webhook failed:`, webhookErr)
        }
      }
    }
  }

  return res.json({
    received: true,
    matched: true,
    rejected: false,
    order_id: match.id,
    status: transition.status,
    reason,
    is_cod: isCod,
    earnings_scheduled: Boolean(shouldPay),
  })
}

import { enqueueNotification } from "../services/interakt/outbox"
import { itlNotificationEvent } from "../services/interakt/interakt.service"
import type { MedusaRequest } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { markOrderFulfillmentAsDeliveredWorkflow } from "@medusajs/medusa/core-flows"
import { trackSelfShipment } from "../services/self-shipping-tracking"
import {
  easyShipDisplayName,
  getEasyShipProvider,
} from "../services/easy-ship"
import { shipVendorFulfillment } from "./vendor-order-fulfillment"
import { getSharedDbPool } from "./db-pool"
import { scheduleVendorEarningsOnDelivery } from "./vendor-earnings"
import {
  buildLogisticsStatusPatch,
  normalizeNdrReason,
  stageFromLogisticsStatus,
} from "./vendor-logistics-status"

type MedusaContainer = MedusaRequest["scope"]
import {
  extractTrackingStatus,
  getPaymentType,
  getVendorWorkflow,
  getVendorWorkflows,
  mergeVendorWorkflowMetadata,
  normalizeTrackingStatus,
  summarizeTrackingPayload,
  type VendorOrderStage,
  type VendorOrderWorkflow,
} from "./vendor-order-workflow"

type OrderLike = {
  id: string
  metadata?: Record<string, unknown> | null
  fulfillments?: any[]
  items?: any[]
}

export function stageFromTrackingStatus(status: string): VendorOrderStage | null {
  return stageFromLogisticsStatus(status)
}

const STAGE_RANK: Record<VendorOrderStage, number> = {
  cancelled: -1,
  to_accept: 0,
  to_pack: 1,
  to_dispatch: 2,
  in_transit: 3,
  delivered: 4,
}

/** Never move a shipment backwards (Amazon-style). */
function canAdvanceStage(
  current: VendorOrderStage | null | undefined,
  next: VendorOrderStage | null
): next is VendorOrderStage {
  if (!next) return false
  if (current === "cancelled") return false
  if (!current) return true
  return STAGE_RANK[next] >= STAGE_RANK[current]
}

function asRequest(container: MedusaContainer): MedusaRequest {
  return { scope: container } as MedusaRequest
}

async function persistWorkflow(
  container: MedusaContainer,
  order: OrderLike,
  vendorId: string,
  patch: VendorOrderWorkflow
) {
  const orderModule = container.resolve(Modules.ORDER)
  const metadata = mergeVendorWorkflowMetadata(order.metadata, vendorId, patch)
  await orderModule.updateOrders(order.id, { metadata })
  order.metadata = metadata
  return metadata
}

async function fetchTrackingForWorkflow(workflow: VendorOrderWorkflow) {
  if (workflow.shipping_method === "easy") {
    const provider = getEasyShipProvider()
    const providerLabel =
      easyShipDisplayName(workflow.shipping_provider) || provider.displayName
    const trackSource =
      workflow.shipping_provider === "shiprocket" || provider.name === "shiprocket"
        ? "shiprocket"
        : "itl"

    const awb = workflow.shiprocket_awb || workflow.tracking_number
    if (!awb) {
      return summarizeTrackingPayload({
        provider: "easy",
        courierPartnerName: workflow.easy_courier_partner || providerLabel,
        awb: null,
        status: normalizeTrackingStatus(workflow.shiprocket_status || "created"),
        error: "AWB not assigned yet",
        source: trackSource,
      })
    }
    try {
      const payload = await provider.trackByAwb(String(awb))
      return {
        ...summarizeTrackingPayload({
          provider: "easy",
          courierPartnerName: workflow.easy_courier_partner || providerLabel,
          awb: String(awb),
          payload,
          status: extractTrackingStatus(payload),
          source: trackSource,
        }),
        notification_status: (payload as any).current_status,
        tracking_url:
          workflow.tracking_url || provider.trackingUrlForAwb(String(awb)) || null,
        label_url: workflow.label_url || null,
      }
    } catch (error: any) {
      return summarizeTrackingPayload({
        provider: "easy",
        courierPartnerName: workflow.easy_courier_partner || providerLabel,
        awb: String(awb),
        status: normalizeTrackingStatus(workflow.shiprocket_status || "not_shipped"),
        error: error?.message || "Tracking unavailable",
        source: trackSource,
      })
    }
  }

  if (workflow.shipping_method === "self") {
    const tracking: any = await trackSelfShipment({
      courierPartnerName: workflow.self_courier_partner || null,
      awb: workflow.self_awb || workflow.tracking_number || null,
      trackingSource: workflow.self_tracking_source || null,
    })
    if (workflow.tracking_url) tracking.tracking_url = workflow.tracking_url
    if (workflow.label_url) tracking.label_url = workflow.label_url
    return tracking
  }

  return summarizeTrackingPayload({
    provider: "none",
    courierPartnerName: null,
    awb: null,
    status: "not_shipped",
    error: "No shipping method selected",
  })
}

/**
 * Amazon-style: pull carrier status and advance vendor stage / fulfillment.
 * Safe to call from Track API or the background sync job.
 */
export async function syncVendorShipmentTracking(input: {
  container: MedusaContainer
  order: OrderLike
  vendorId: string
  vendorProductIds: string[]
  /** When true, create Medusa shipment if carrier shows movement / shipped */
  ensureShippedOnMovement?: boolean
}) {
  const { container, order, vendorId, vendorProductIds } = input
  const ensureShipped = input.ensureShippedOnMovement !== false
  const workflow = getVendorWorkflow(order.metadata, vendorId)

  if (!workflow.shipping_method) {
    return { updated: false, tracking: null as any, status: "", stage: workflow.stage || null }
  }

  if (workflow.stage === "delivered") {
    // Still allow COD cash_collected updates after delivery
    const peek = await fetchTrackingForWorkflow(workflow)
    await enqueueItlTracking(container, order, workflow, peek)
    const peekStatus = normalizeTrackingStatus(peek?.status || "")
    if (peekStatus !== "cash_collected") {
      return {
        updated: false,
        tracking: peek,
        status: "delivered",
        stage: "delivered" as VendorOrderStage,
      }
    }
  }

  const tracking = await fetchTrackingForWorkflow(workflow)
  await enqueueItlTracking(container, order, workflow, tracking)
  const status = normalizeTrackingStatus(tracking?.status || workflow.shiprocket_status || "")
  const ndrReason = normalizeNdrReason(tracking?.ndr_reason || workflow.ndr_reason)
  const nextStage = stageFromTrackingStatus(status)
  const isCod = getPaymentType(order as any) === "PostPaid"

  let metadata = order.metadata
  let stage = (workflow.stage || null) as VendorOrderStage | null
  let updated = false

  // Carrier says package is moving → ensure Medusa shipment exists (In Transit).
  // Easy Ship: allow auto-ship once AWB exists (admin may book before vendor RTD).
  const hasEasyAwb = Boolean(
    workflow.shipping_method === "easy" &&
      (workflow.shiprocket_awb || workflow.tracking_number)
  )
  const canAutoShip = Boolean(workflow.rtd_at || hasEasyAwb)
  if (
    ensureShipped &&
    nextStage === "in_transit" &&
    !workflow.medusa_shipped_at &&
    canAutoShip
  ) {
    try {
      const shipped = await shipVendorFulfillment(
        asRequest(container),
        order,
        vendorId,
        vendorProductIds,
        workflow
      )
      const now = new Date().toISOString()
      metadata = await persistWorkflow(container, order, vendorId, {
        stage: "in_transit",
        medusa_fulfillment_id: shipped.fulfillment_id,
        medusa_shipped_at: workflow.medusa_shipped_at || now,
        shiprocket_status: status || "shipped",
        easy_tracking_status: status || "shipped",
        easy_tracking_checked_at: now,
        dispatched_at: workflow.dispatched_at || now,
      })
      stage = "in_transit"
      updated = true
    } catch (error: any) {
      console.warn(
        `[shipment-sync] ship failed order=${order.id} vendor=${vendorId}:`,
        error?.message
      )
      // Still flip vendor stage so portal shows In Transit even if Medusa ship fails
      if (canAdvanceStage(stage, "in_transit")) {
        const now = new Date().toISOString()
        metadata = await persistWorkflow(container, order, vendorId, {
          stage: "in_transit",
          shiprocket_status: status || "picked_up",
          easy_tracking_status: status || "picked_up",
          easy_tracking_checked_at: now,
        })
        stage = "in_transit"
        updated = true
      }
    }
  }

  const logistics = buildLogisticsStatusPatch({
    status,
    reason: ndrReason,
    isCodOrder: isCod,
  })
  if (status === "cash_collected" && (workflow.stage === "delivered" || stage === "delivered")) {
    logistics.stage = "delivered"
  }
  const { should_schedule_earnings, ...logisticsPatch } = logistics
  const trackingStamp = {
    easy_tracking_status: status || null,
    easy_tracking_checked_at: new Date().toISOString(),
  }

  if (nextStage === "delivered") {
    const fulfillmentId = String(
      getVendorWorkflow(order.metadata, vendorId).medusa_fulfillment_id ||
        workflow.medusa_fulfillment_id ||
        ""
    )
    if (fulfillmentId) {
      const alreadyDelivered = (order.fulfillments || []).some(
        (f: any) => f?.id === fulfillmentId && f?.delivered_at
      )
      if (!alreadyDelivered) {
        try {
          await markOrderFulfillmentAsDeliveredWorkflow(container).run({
            input: { orderId: order.id, fulfillmentId },
          })
        } catch (error: any) {
          console.warn(
            `[shipment-sync] mark delivered failed order=${order.id}:`,
            error?.message
          )
        }
      }
    }

    metadata = await persistWorkflow(container, order, vendorId, {
      ...logisticsPatch,
      ...trackingStamp,
      stage: "delivered",
      shiprocket_status: "delivered",
      shiprocket_delivered_at: new Date().toISOString(),
    })
    stage = "delivered"
    updated = true

    if (should_schedule_earnings) {
      try {
        const pool = getSharedDbPool()
        await scheduleVendorEarningsOnDelivery(order.id, pool, { vendorId })
      } catch (error: any) {
        console.warn(
          `[shipment-sync] earnings schedule failed order=${order.id}:`,
          error?.message
        )
      }
    }
  } else if (status === "cash_collected") {
    metadata = await persistWorkflow(container, order, vendorId, {
      ...logisticsPatch,
      ...trackingStamp,
    })
    updated = true
    if (should_schedule_earnings || isCod) {
      try {
        const pool = getSharedDbPool()
        await scheduleVendorEarningsOnDelivery(order.id, pool, { vendorId })
      } catch (error: any) {
        console.warn(
          `[shipment-sync] COD earnings schedule failed order=${order.id}:`,
          error?.message
        )
      }
    }
  } else if (
    status === "ndr" ||
    status === "rto_initiated" ||
    status === "rto_in_transit" ||
    status === "rto_delivered"
  ) {
    metadata = await persistWorkflow(container, order, vendorId, {
      ...logisticsPatch,
      ...trackingStamp,
      stage: canAdvanceStage(stage, "in_transit") ? "in_transit" : stage || "in_transit",
    })
    stage = "in_transit"
    updated = true
  } else if (canAdvanceStage(stage, nextStage) && nextStage !== stage) {
    // picked_up / in_transit / out_for_delivery → vendor "In Transit"
    metadata = await persistWorkflow(container, order, vendorId, {
      stage: nextStage,
      shiprocket_status: status || workflow.shiprocket_status || null,
      ...trackingStamp,
      ...(ndrReason ? { ndr_reason: ndrReason } : {}),
    })
    stage = nextStage
    updated = true
  } else if (status && status !== workflow.shiprocket_status) {
    metadata = await persistWorkflow(container, order, vendorId, {
      shiprocket_status: status,
      ...trackingStamp,
      ...(ndrReason ? { ndr_reason: ndrReason } : {}),
      // Easy Ship pickup must never leave vendor stuck on to_pack / to_dispatch
      ...(nextStage === "in_transit" && canAdvanceStage(stage, "in_transit")
        ? { stage: "in_transit" as VendorOrderStage }
        : {}),
    })
    if (nextStage === "in_transit" && canAdvanceStage(stage, "in_transit")) {
      stage = "in_transit"
    }
    updated = true
  }

  return { updated, tracking, status, stage, metadata }
}

/**
 * Find open vendor shipments (self + easy) that still need carrier polling.
 */
export async function listOpenVendorShipmentsForSync(limit = 80): Promise<
  Array<{ order_id: string; vendor_id: string }>
> {
  const pool = getSharedDbPool()
  const { rows } = await pool.query<{ id: string; metadata: any }>(
    `
      SELECT id, metadata
      FROM "order"
      WHERE deleted_at IS NULL
        AND (
          metadata::text ILIKE '%"shipping_method":"self"%'
          OR metadata::text ILIKE '%"shipping_method":"easy"%'
        )
        AND (
          metadata::text ILIKE '%"stage":"in_transit"%'
          OR metadata::text ILIKE '%"stage":"to_dispatch"%'
          OR metadata::text ILIKE '%"stage":"to_pack"%'
          OR metadata::text ILIKE '%"easy_booking_status":"booked"%'
          OR metadata::text ILIKE '%"shiprocket_awb"%'
        )
      ORDER BY updated_at DESC NULLS LAST
      LIMIT $1
    `,
    [limit]
  )

  const targets: Array<{ order_id: string; vendor_id: string }> = []
  for (const row of rows || []) {
    const workflows = getVendorWorkflows(row.metadata)
    for (const [vendorId, workflow] of Object.entries(workflows)) {
      if (!workflow?.shipping_method) continue
      if (workflow.stage === "delivered") continue
      if (!["self", "easy"].includes(String(workflow.shipping_method))) continue
      const hasTracking = Boolean(
        workflow.self_awb ||
          workflow.shiprocket_awb ||
          workflow.tracking_number ||
          workflow.tracking_url
      )
      if (!hasTracking) continue
      // Only sync once packing/RTD started, or when already in transit/to_dispatch
      if (
        workflow.stage === "to_pack" &&
        !workflow.rtd_at &&
        workflow.shipping_method === "self"
      ) {
        continue
      }
      targets.push({ order_id: row.id, vendor_id: vendorId })
    }
  }
  return targets
}

async function enqueueItlTracking(container: any, order: OrderLike, workflow: VendorOrderWorkflow, tracking: any) {
  const event = itlNotificationEvent(tracking?.notification_status)
  const staleShipped = event === "order_shipped" &&
    (workflow.stage === "delivered" || workflow.stage === "cancelled" ||
      ["delivered", "cash_collected", "cancelled", "rto_initiated", "rto_in_transit", "rto_delivered"].includes(String(workflow.shiprocket_status)))
  if (event && !staleShipped && !tracking?.error && tracking?.source === "itl" &&
      workflow.shipping_method === "easy" && getEasyShipProvider().name === "itl" && process.env.ITL_MODE === "live") {
    await enqueueNotification(container, order.id, event, tracking.tracking_url)
  }
}
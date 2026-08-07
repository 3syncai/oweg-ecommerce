import type { MedusaRequest } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { markOrderFulfillmentAsDeliveredWorkflow } from "@medusajs/medusa/core-flows"
import { trackSelfShipment } from "../services/self-shipping-tracking"
import ShiprocketService from "../services/shiprocket"
import { shipVendorFulfillment } from "./vendor-order-fulfillment"
import { getSharedDbPool } from "./db-pool"
import { scheduleVendorEarningsOnDelivery } from "./vendor-earnings"

type MedusaContainer = MedusaRequest["scope"]
import {
  extractTrackingStatus,
  getVendorWorkflow,
  getVendorWorkflows,
  isMovementTrackingStatus,
  isPreDispatchTrackingStatus,
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
  if (status === "delivered") return "delivered"
  if (isMovementTrackingStatus(status)) return "in_transit"
  if (isPreDispatchTrackingStatus(status)) return "to_dispatch"
  return null
}

const STAGE_RANK: Record<VendorOrderStage, number> = {
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
    const awb = workflow.shiprocket_awb || workflow.tracking_number
    if (!awb) {
      return summarizeTrackingPayload({
        provider: "easy",
        courierPartnerName: workflow.easy_courier_partner || "Shiprocket",
        awb: null,
        status: normalizeTrackingStatus(workflow.shiprocket_status || "created"),
        error: "AWB not assigned yet",
      })
    }
    try {
      const shiprocket = new ShiprocketService()
      const payload = await shiprocket.trackByAwb(String(awb))
      return {
        ...summarizeTrackingPayload({
          provider: "easy",
          courierPartnerName: workflow.easy_courier_partner || "Shiprocket",
          awb: String(awb),
          payload,
          status: extractTrackingStatus(payload),
        }),
        tracking_url: workflow.tracking_url || null,
        label_url: workflow.label_url || null,
      }
    } catch (error: any) {
      return summarizeTrackingPayload({
        provider: "easy",
        courierPartnerName: workflow.easy_courier_partner || "Shiprocket",
        awb: String(awb),
        status: normalizeTrackingStatus(workflow.shiprocket_status || "not_shipped"),
        error: error?.message || "Tracking unavailable",
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
    return {
      updated: false,
      tracking: null as any,
      status: "delivered",
      stage: "delivered" as VendorOrderStage,
    }
  }

  const tracking = await fetchTrackingForWorkflow(workflow)
  const status = normalizeTrackingStatus(tracking?.status || workflow.shiprocket_status || "")
  const nextStage = stageFromTrackingStatus(status)

  let metadata = order.metadata
  let stage = (workflow.stage || null) as VendorOrderStage | null
  let updated = false

  // Carrier says package is moving → ensure Medusa shipment exists (In Transit)
  if (
    ensureShipped &&
    nextStage === "in_transit" &&
    !workflow.medusa_shipped_at &&
    workflow.rtd_at
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
        dispatched_at: workflow.dispatched_at || now,
      })
      stage = "in_transit"
      updated = true
    } catch (error: any) {
      console.warn(
        `[shipment-sync] ship failed order=${order.id} vendor=${vendorId}:`,
        error?.message
      )
    }
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
      stage: "delivered",
      shiprocket_status: "delivered",
      shiprocket_delivered_at: new Date().toISOString(),
    })
    stage = "delivered"
    updated = true

    try {
      const pool = getSharedDbPool()
      await scheduleVendorEarningsOnDelivery(order.id, pool)
    } catch (error: any) {
      console.warn(
        `[shipment-sync] earnings schedule failed order=${order.id}:`,
        error?.message
      )
    }
  } else if (canAdvanceStage(stage, nextStage) && nextStage !== stage) {
    metadata = await persistWorkflow(container, order, vendorId, {
      stage: nextStage,
      shiprocket_status: status || workflow.shiprocket_status || null,
    })
    stage = nextStage
    updated = true
  } else if (status && status !== workflow.shiprocket_status) {
    metadata = await persistWorkflow(container, order, vendorId, {
      shiprocket_status: status,
    })
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

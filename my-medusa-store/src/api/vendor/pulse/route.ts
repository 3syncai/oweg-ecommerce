import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import { setVendorOrderCorsHeaders } from "../../../lib/vendor-order-workflow"
import { getSharedDbPool } from "../../../lib/db-pool"
import { findVendorOrderIds } from "../../../lib/vendor-order-ids"
import {
  formatVendorOrder,
  getVendorProductIds,
} from "../../../lib/vendor-order-workflow"
import { filterVendorVisibleOrders } from "../../../lib/vendor-order-visibility"
import ReturnModuleService from "../../../modules/returns/service"
import { RETURN_MODULE } from "../../../modules/returns"
import {
  getVendorEarningsSummary,
  syncVendorEarningsStatuses,
} from "../../../lib/vendor-earnings"

function emptyPulse() {
  return {
    to_accept: 0,
    returns_pending_approval: 0,
    returns_in_progress: 0,
    open_tickets: 0,
    payout: {
      available_balance: 0,
      unlocking_balance: 0,
      total_withdrawn: 0,
    },
    credited_recent: [] as any[],
    revision: "0",
  }
}

function buildPulseRevision(input: {
  to_accept: number
  returns_pending_approval: number
  returns_in_progress: number
  available_balance: number
  unlocking_balance: number
  credited_recent_id?: string | null
}) {
  return [
    input.to_accept,
    input.returns_pending_approval,
    input.returns_in_progress,
    Math.round(Number(input.available_balance) || 0),
    Math.round(Number(input.unlocking_balance) || 0),
    input.credited_recent_id || "",
  ].join(":")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  return res.status(200).end()
}

/**
 * GET /vendor/pulse
 * Lightweight badge / notification snapshot — avoids full list endpoints.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setVendorOrderCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const started = Date.now()
  try {
    const query = req.scope.resolve("query")
    const pool = getSharedDbPool()
    const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)

    const vendorProductIds = await getVendorProductIds(req, auth.vendor_id)
    if (!vendorProductIds.length) {
      return res.json({
        ...emptyPulse(),
        revision: buildPulseRevision({
          to_accept: 0,
          returns_pending_approval: 0,
          returns_in_progress: 0,
          available_balance: 0,
          unlocking_balance: 0,
        }),
        ms: Date.now() - started,
      })
    }

    const orderIds = await findVendorOrderIds(pool, auth.vendor_id, vendorProductIds)
    const productIdSet = new Set(vendorProductIds)

    let toAccept = 0
    if (orderIds.length) {
      const { data: ordersData } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "status",
          "is_draft_order",
          "metadata",
          "items.product_id",
          "items.variant.product_id",
          "fulfillments.delivered_at",
          "fulfillments.shipped_at",
          "fulfillments.canceled_at",
        ],
        filters: { id: orderIds },
      })
      const visible = filterVendorVisibleOrders(
        (ordersData || []).filter((order: any) =>
          (order.items || []).some((item: any) => {
            const productId = item.product_id || item.variant?.product_id
            return productId && productIdSet.has(productId)
          })
        )
      )
      for (const order of visible) {
        const formatted = formatVendorOrder(order, auth.vendor_id, vendorProductIds, null)
        if (formatted.vendor_stage === "to_accept") toAccept += 1
      }
    }

    let returnsPending = 0
    let returnsInProgress = 0
    if (orderIds.length) {
      let requests: any[] = []
      try {
        requests = await returnService.listReturnRequests({ order_id: orderIds } as any)
      } catch {
        const all = await returnService.listReturnRequests({})
        const idSet = new Set(orderIds)
        requests = (all || []).filter((r: any) => r?.order_id && idSet.has(r.order_id))
      }
      for (const request of requests || []) {
        const status = String(request?.status || "")
        if (status === "pending_approval") returnsPending += 1
        if (
          ["pending_approval", "approved", "pickup_initiated", "picked_up", "received"].includes(
            status
          )
        ) {
          returnsInProgress += 1
        }
      }
    }

    let payout = {
      available_balance: 0,
      unlocking_balance: 0,
      total_withdrawn: 0,
    }
    let creditedRecent: any[] = []
    try {
      await syncVendorEarningsStatuses(pool)
      const summary = await getVendorEarningsSummary(auth.vendor_id, pool)
      payout = {
        available_balance: Number(summary?.available_balance) || 0,
        unlocking_balance: Number(summary?.unlocking_balance) || 0,
        total_withdrawn: Number(summary?.total_withdrawn) || 0,
      }
      creditedRecent = Array.isArray(summary?.credited_recent)
        ? summary.credited_recent.slice(0, 10)
        : []
    } catch (e: any) {
      console.warn("[Vendor pulse] payout summary skipped:", e?.message)
    }

    const revision = buildPulseRevision({
      to_accept: toAccept,
      returns_pending_approval: returnsPending,
      returns_in_progress: returnsInProgress,
      available_balance: payout.available_balance,
      unlocking_balance: payout.unlocking_balance,
      credited_recent_id: creditedRecent[0]?.id || null,
    })

    console.log(
      `[Vendor pulse] vendor=${auth.vendor_id} to_accept=${toAccept} returns=${returnsInProgress} ${Date.now() - started}ms`
    )

    return res.json({
      to_accept: toAccept,
      returns_pending_approval: returnsPending,
      returns_in_progress: returnsInProgress,
      open_tickets: 0,
      payout,
      credited_recent: creditedRecent,
      revision,
      ms: Date.now() - started,
    })
  } catch (error: any) {
    console.error("[Vendor pulse] error:", error)
    return res.status(500).json({ message: error?.message || "Failed to load pulse" })
  }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import ReturnModuleService from "../../../modules/returns/service"
import { RETURN_MODULE } from "../../../modules/returns"
import { getItemUnits, getVendorProductIds, getVendorWorkflow } from "../../../lib/vendor-order-workflow"
import {
  getReverseCourierSelection,
  getReturnMetadata,
  getSelfReverseTracking,
  resolveVendorForwardShippingMethod,
} from "../../../lib/vendor-return-shiprocket"
import { findVendorOrderIds } from "../../../lib/vendor-order-ids"
import { getSharedDbPool } from "../../../lib/db-pool"
import {
  parseVendorPagination,
  slicePage,
  paginationMeta,
} from "../../../lib/vendor-pagination"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.VENDOR_CORS || "http://localhost:4000"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

const VENDOR_VISIBLE_STATUSES = new Set([
  "pending_approval",
  "approved",
  "pickup_initiated",
  "picked_up",
  "received",
  "refunded",
  "replaced",
  "closed",
])

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

/**
 * GET /vendor/returns
 * Optional: ?limit=&offset=&status=&q=&counts_only=1
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const pagination = parseVendorPagination(req, 20)
  const countsOnly =
    String(req.query?.counts_only || "").toLowerCase() === "1" ||
    String(req.query?.counts_only || "").toLowerCase() === "true"
  const statusFilter = String(req.query?.status || "").trim().toLowerCase()
  const q = String(req.query?.q || "").trim().toLowerCase()
  const started = Date.now()

  try {
    const query = req.scope.resolve("query")
    const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
    const pool = getSharedDbPool()

    const vendorProductIds = await getVendorProductIds(req, auth.vendor_id)
    if (!vendorProductIds.length) {
      return res.json({
        return_requests: [],
        ...paginationMeta(0, pagination),
        counts: { total: 0, pending_approval: 0, in_progress: 0 },
      })
    }

    const vendorProductIdSet = new Set(vendorProductIds)
    const vendorOrderIds = await findVendorOrderIds(pool, auth.vendor_id, vendorProductIds)
    if (!vendorOrderIds.length) {
      return res.json({
        return_requests: [],
        ...paginationMeta(0, pagination),
        counts: { total: 0, pending_approval: 0, in_progress: 0 },
      })
    }

    // Scope returns to this vendor's orders only (avoid marketplace-wide list)
    let requests: any[] = []
    try {
      requests = await returnService.listReturnRequests({
        order_id: vendorOrderIds,
      } as any)
    } catch {
      // Fallback if $in-style filter unsupported
      const all = await returnService.listReturnRequests({})
      const idSet = new Set(vendorOrderIds)
      requests = (all || []).filter((r: any) => r?.order_id && idSet.has(r.order_id))
    }

    const visibleRequests = (requests || []).filter(
      (request: any) =>
        request?.status && VENDOR_VISIBLE_STATUSES.has(String(request.status))
    )

    const counts = {
      total: visibleRequests.length,
      pending_approval: visibleRequests.filter(
        (r: any) => String(r.status) === "pending_approval"
      ).length,
      in_progress: visibleRequests.filter((r: any) =>
        ["approved", "pickup_initiated", "picked_up", "received"].includes(String(r.status))
      ).length,
      pickup: visibleRequests.filter((r: any) =>
        ["pickup_initiated", "picked_up"].includes(String(r.status))
      ).length,
      refunded: visibleRequests.filter((r: any) =>
        ["refunded", "replaced", "closed"].includes(String(r.status))
      ).length,
      // Approx "needs logistics" without full shipping enrichment
      needs_logistics: visibleRequests.filter((r: any) => {
        const status = String(r.status || "")
        if (!["pending_approval", "approved"].includes(status)) return false
        if (r.pickup_initiated_at || r.shiprocket_order_id) return false
        return true
      }).length,
    }

    if (countsOnly) {
      console.log(
        `[Vendor returns] vendor=${auth.vendor_id} counts_only total=${counts.total} ${Date.now() - started}ms`
      )
      return res.json({
        return_requests: [],
        ...paginationMeta(0, pagination),
        counts,
      })
    }

    let filtered = visibleRequests
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "pending" || statusFilter === "needs_logistics") {
        filtered = filtered.filter((r: any) => {
          const status = String(r.status || "")
          if (!["pending_approval", "approved"].includes(status)) return false
          if (r.pickup_initiated_at || r.shiprocket_order_id) return false
          return true
        })
      } else if (
        statusFilter === "approved" ||
        statusFilter === "in_progress"
      ) {
        filtered = filtered.filter((r: any) =>
          ["approved", "pickup_initiated", "picked_up", "received"].includes(String(r.status))
        )
      } else if (statusFilter === "in_transit") {
        filtered = filtered.filter((r: any) =>
          ["pickup_initiated", "picked_up"].includes(String(r.status))
        )
      } else if (statusFilter === "refunded") {
        filtered = filtered.filter((r: any) =>
          ["refunded", "replaced", "closed"].includes(String(r.status))
        )
      } else {
        filtered = filtered.filter(
          (r: any) => String(r.status).toLowerCase() === statusFilter
        )
      }
    }

    filtered.sort((a: any, b: any) => {
      const aTime = new Date(a.created_at || 0).getTime()
      const bTime = new Date(b.created_at || 0).getTime()
      return bTime - aTime
    })

    // Load only orders needed for the page (or all filtered when no pagination)
    const pageRequests = slicePage(filtered, pagination)
    const orderIdsNeeded = Array.from(
      new Set(pageRequests.map((r: any) => r.order_id).filter(Boolean))
    ) as string[]

    // For search we may need display_id — if q set, enrich all filtered then re-slice
    const orderIdsForQuery =
      q && !pagination.all
        ? (Array.from(new Set(filtered.map((r: any) => r.order_id).filter(Boolean))) as string[])
        : orderIdsNeeded

    const ordersById = new Map<string, any>()
    if (orderIdsForQuery.length) {
      const { data: ordersData } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "email",
          "customer_id",
          "created_at",
          "summary",
          "metadata",
          "items.id",
          "items.title",
          "items.quantity",
          "items.detail.quantity",
          "items.product_id",
          "items.variant.product_id",
          "customer.first_name",
          "customer.last_name",
          "customer.email",
          "shipping_address.first_name",
          "shipping_address.last_name",
        ],
        filters: { id: orderIdsForQuery },
      })
      for (const order of ordersData || []) {
        if (order?.id) ordersById.set(order.id, order)
      }
    }

    let working = filtered
    if (q) {
      working = filtered.filter((request: any) => {
        const order = ordersById.get(request.order_id)
        const hay = [
          request.id,
          request.order_id,
          order?.display_id,
          order?.email,
          request.reason,
          request.status,
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" ")
        return hay.includes(q)
      })
    }

    const total = working.length
    const pageSlice = slicePage(working, pagination)
    const pageIds = new Set(pageSlice.map((r: any) => r.id))

    let allItems: any[] = []
    if (pageIds.size) {
      try {
        allItems = await returnService.listReturnRequestItems({
          return_request_id: Array.from(pageIds),
        } as any)
      } catch {
        const every = await returnService.listReturnRequestItems({})
        allItems = (every || []).filter((item: any) => pageIds.has(item.return_request_id))
      }
    }

    const itemsByRequest = new Map<string, any[]>()
    for (const item of allItems) {
      const list = itemsByRequest.get(item.return_request_id) || []
      list.push(item)
      itemsByRequest.set(item.return_request_id, list)
    }

    const enriched = pageSlice.map((request: any) => {
      const order = request.order_id ? ordersById.get(request.order_id) : null
      const customer = order?.customer || null
      const customerName = [
        customer?.first_name || order?.shipping_address?.first_name || "",
        customer?.last_name || order?.shipping_address?.last_name || "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim()

      const orderItems = order?.items || []
      const vendorLineItems = orderItems.filter((item: any) => {
        const productId = item.product_id || item.variant?.product_id
        return productId && vendorProductIdSet.has(productId)
      })

      const returnItems = itemsByRequest.get(request.id) || []
      const orderItemById = new Map<string, any>(
        orderItems.map((item: any) => [String(item.id), item])
      )

      const enrichedItems = returnItems.map((ri: any) => {
        const original = orderItemById.get(String(ri.order_item_id))
        const qty = Number(ri.quantity)
        return {
          id: ri.id,
          order_item_id: ri.order_item_id,
          quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
          condition: ri.condition ?? null,
          reason: ri.reason ?? null,
          title: (original as any)?.title || "Item",
        }
      })

      const workflow = getVendorWorkflow(order?.metadata || null, auth.vendor_id)
      const shippingMethod =
        resolveVendorForwardShippingMethod(order, auth.vendor_id) ||
        (workflow.shipping_method === "easy"
          ? "easy"
          : workflow.shipping_method === "self"
            ? "self"
            : null)
      const selection = getReverseCourierSelection(request)
      const meta = getReturnMetadata(request)
      const selfTracking = getSelfReverseTracking(request)
      const hasSelfTracking = Boolean(
        selfTracking.reverse_courier_partner &&
          selfTracking.reverse_tracking_number &&
          selfTracking.reverse_tracking_url
      )
      const activeForLogistics = ["pending_approval", "approved", "pickup_initiated"].includes(
        String(request.status)
      )
      const isEasy = shippingMethod === "easy"
      const easyReturnBooked = Boolean(
        request.shiprocket_awb ||
          request.pickup_initiated_at ||
          request.shiprocket_order_id ||
          meta.return_admin_booking_status === "booked"
      )
      const easyAwaitingAdmin =
        isEasy && String(request.status) === "approved" && !easyReturnBooked
      const canAdvanceSelfShipStatus =
        shippingMethod !== "self" || hasSelfTracking
      const canAdvanceEasyReturnStatus = isEasy && easyReturnBooked

      const returnLogisticsTimeline = isEasy
        ? [
            {
              key: "requested",
              label: "Return requested",
              at: request.created_at || null,
              done: true,
            },
            {
              key: "approved",
              label: "Approved by admin",
              at: request.approved_at || null,
              done: Boolean(request.approved_at),
            },
            {
              key: "awaiting_admin",
              label: "Waiting for admin to book return pickup",
              at: null,
              done: !easyAwaitingAdmin,
              active: easyAwaitingAdmin,
            },
            {
              key: "pickup_initiated",
              label: "Return pickup initiated",
              at: request.pickup_initiated_at || meta.admin_return_booked_at || null,
              done: Boolean(request.pickup_initiated_at || easyReturnBooked),
            },
            {
              key: "picked_up",
              label: "Product picked up from customer",
              at: request.picked_up_at || null,
              done: Boolean(request.picked_up_at),
            },
            {
              key: "received",
              label: "Delivered to your store",
              at: request.received_at || null,
              done: Boolean(request.received_at),
            },
            {
              key: "refunded",
              label: "Refund processed",
              at: request.refunded_at || null,
              done: ["refunded", "closed", "replaced"].includes(String(request.status)),
            },
          ]
        : []

      let easyReturnStatusLabel: string | null = null
      if (isEasy) {
        if (easyAwaitingAdmin) {
          easyReturnStatusLabel = "Waiting for admin to book return pickup"
        } else if (String(request.status) === "received" || meta.returned_to_vendor) {
          easyReturnStatusLabel = "Delivered to your store"
        } else if (String(request.status) === "picked_up" || request.picked_up_at) {
          easyReturnStatusLabel = "Product picked up — in transit to you"
        } else if (easyReturnBooked || String(request.status) === "pickup_initiated") {
          easyReturnStatusLabel = request.shiprocket_awb
            ? `Return pickup booked · AWB ${request.shiprocket_awb}`
            : "Return pickup initiated"
        } else if (String(request.status) === "pending_approval") {
          easyReturnStatusLabel = "Awaiting admin approval"
        } else {
          easyReturnStatusLabel = String(request.status || "unknown").replace(/_/g, " ")
        }
      }

      return {
        id: request.id,
        order_id: request.order_id,
        order_display_id: order?.display_id ?? null,
        type: request.type,
        status: request.status,
        reason: request.reason,
        notes: request.notes,
        payment_type: request.payment_type,
        refund_method: request.refund_method,
        rejection_reason: request.rejection_reason,
        approved_at: request.approved_at,
        rejected_at: request.rejected_at,
        pickup_initiated_at: request.pickup_initiated_at,
        picked_up_at: request.picked_up_at,
        received_at: request.received_at,
        refunded_at: request.refunded_at,
        shiprocket_awb: request.shiprocket_awb,
        shiprocket_status: request.shiprocket_status,
        created_at: request.created_at,
        updated_at: request.updated_at,
        customer_email: order?.email || customer?.email || null,
        customer_name: customerName || null,
        items: enrichedItems,
        vendor_items: vendorLineItems.map((item: any) => ({
          id: item.id,
          title: item.title,
          quantity: getItemUnits(item),
        })),
        order_total: order?.summary?.current_order_total ?? null,
        shipping_method: shippingMethod,
        reverse_courier_id: selection?.reverse_courier_id ?? meta.reverse_courier_id ?? null,
        reverse_courier_name:
          selection?.reverse_courier_name ?? meta.reverse_courier_name ?? null,
        reverse_courier_rate:
          meta.reverse_courier_rate != null ? Number(meta.reverse_courier_rate) : null,
        reverse_courier_selected_at:
          selection?.reverse_courier_selected_at ??
          meta.reverse_courier_selected_at ??
          null,
        ...selfTracking,
        can_select_reverse_courier: false,
        can_add_self_tracking: shippingMethod === "self" && activeForLogistics,
        needs_return_logistics:
          activeForLogistics &&
          ((isEasy && easyAwaitingAdmin) ||
            (shippingMethod === "self" && !hasSelfTracking)),
        easy_return_booking_status: isEasy
          ? easyReturnBooked
            ? "booked"
            : easyAwaitingAdmin
              ? "awaiting_admin"
              : null
          : null,
        easy_return_status_label: easyReturnStatusLabel,
        return_logistics_timeline: returnLogisticsTimeline,
        awaiting_admin_return_booking: easyAwaitingAdmin,
        can_mark_pickup_initiated:
          !isEasy &&
          canAdvanceSelfShipStatus &&
          ["approved", "pending_approval"].includes(String(request.status)),
        can_mark_picked_up:
          !isEasy &&
          canAdvanceSelfShipStatus &&
          ["approved", "pickup_initiated"].includes(String(request.status)),
        can_mark_received:
          (isEasy
            ? canAdvanceEasyReturnStatus &&
              ["pickup_initiated", "picked_up"].includes(String(request.status))
            : canAdvanceSelfShipStatus &&
              ["approved", "pickup_initiated", "picked_up"].includes(
                String(request.status)
              )),
        returned_to_vendor:
          String(request.status) === "received" || Boolean(meta.returned_to_vendor),
        returned_to_vendor_at: meta.returned_to_vendor_at
          ? String(meta.returned_to_vendor_at)
          : request.received_at || null,
      }
    })

    console.log(
      `[Vendor returns] vendor=${auth.vendor_id} total=${total} page=${enriched.length} ${Date.now() - started}ms`
    )

    return res.json({
      return_requests: enriched,
      ...paginationMeta(total, pagination),
      counts,
    })
  } catch (error: any) {
    console.error("[Vendor returns] error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to list returns",
    })
  }
}

import type { MedusaRequest } from "@medusajs/framework/http"
import ReturnModuleService from "../modules/returns/service"
import { RETURN_MODULE } from "../modules/returns"
import { getSharedDbPool } from "./db-pool"
import { getVendorWorkflows } from "./vendor-order-workflow"
import {
  getReturnMetadata,
  isVendorEasyShipOrder,
  resolveReturnVendorId,
} from "./vendor-return-shiprocket"

export type ReturnPacketBookingQueueStatus = "awaiting_booking" | "booked"

export type ReturnPacketBookingQueueItem = {
  return_id: string
  order_id: string
  order_display_id: string | number | null
  vendor_id: string
  vendor_name: string | null
  store_name: string | null
  return_status: string
  reason: string | null
  approved_at: string | null
  pickup_initiated_at: string | null
  picked_up_at: string | null
  received_at: string | null
  customer_pickup_pincode: string | null
  vendor_delivery_pincode: string | null
  shiprocket_awb: string | null
  shiprocket_status: string | null
  reverse_courier_name: string | null
  reverse_courier_rate: number | null
  admin_return_booked_at: string | null
  created_at: string | null
  status: ReturnPacketBookingQueueStatus
}

function isBooked(request: any): boolean {
  const meta = getReturnMetadata(request)
  return Boolean(
    request.shiprocket_order_id ||
      request.shiprocket_awb ||
      request.pickup_initiated_at ||
      meta.return_admin_booking_status === "booked" ||
      meta.admin_return_booked_at
  )
}

/**
 * Easy Ship returns where admin must book reverse pickup (customer → vendor).
 */
export async function listReturnPacketBookingQueue(
  req: MedusaRequest,
  opts?: {
    status?: ReturnPacketBookingQueueStatus | "all" | "open"
    limit?: number
  }
): Promise<ReturnPacketBookingQueueItem[]> {
  const statusFilter = opts?.status || "open"
  const limit = Math.min(Math.max(Number(opts?.limit) || 100, 1), 300)
  const pool = getSharedDbPool()

  const { rows } = await pool.query<{
    id: string
    order_id: string
    status: string
    reason: string | null
    approved_at: string | null
    pickup_initiated_at: string | null
    picked_up_at: string | null
    received_at: string | null
    shiprocket_awb: string | null
    shiprocket_status: string | null
    shiprocket_order_id: string | null
    metadata: any
    created_at: string | null
    display_id: string | number | null
    order_metadata: any
    shipping_postal_code: string | null
  }>(
    `
      SELECT
        rr.id,
        rr.order_id,
        rr.status,
        rr.reason,
        rr.approved_at,
        rr.pickup_initiated_at,
        rr.picked_up_at,
        rr.received_at,
        rr.shiprocket_awb,
        rr.shiprocket_status,
        rr.shiprocket_order_id,
        rr.metadata,
        rr.created_at,
        o.display_id,
        o.metadata AS order_metadata,
        sa.postal_code AS shipping_postal_code
      FROM return_request rr
      INNER JOIN "order" o ON o.id = rr.order_id AND o.deleted_at IS NULL
      LEFT JOIN order_address sa ON sa.id = o.shipping_address_id
      WHERE rr.deleted_at IS NULL
        AND rr.status IN ('approved', 'pickup_initiated', 'picked_up', 'received')
      ORDER BY rr.updated_at DESC NULLS LAST
      LIMIT $1
    `,
    [Math.max(limit * 6, 200)]
  )

  const items: ReturnPacketBookingQueueItem[] = []

  for (const row of rows || []) {
    const order = {
      id: row.order_id,
      metadata: row.order_metadata,
      shipping_address: { postal_code: row.shipping_postal_code },
    }

    const request = {
      id: row.id,
      order_id: row.order_id,
      status: row.status,
      reason: row.reason,
      approved_at: row.approved_at,
      pickup_initiated_at: row.pickup_initiated_at,
      picked_up_at: row.picked_up_at,
      received_at: row.received_at,
      shiprocket_awb: row.shiprocket_awb,
      shiprocket_status: row.shiprocket_status,
      shiprocket_order_id: row.shiprocket_order_id,
      metadata: row.metadata,
      created_at: row.created_at,
    }

    const vendorId = await resolveReturnVendorId(req, order, request)
    if (!vendorId || !isVendorEasyShipOrder(order, vendorId)) continue

    if (String(request.status) !== "approved" && !isBooked(request)) continue

    const booked = isBooked(request)
    const queueStatus: ReturnPacketBookingQueueStatus = booked
      ? "booked"
      : "awaiting_booking"

    if (queueStatus === "awaiting_booking" && String(request.status) !== "approved") {
      continue
    }

    if (statusFilter === "open") {
      if (queueStatus === "booked") continue
    } else if (statusFilter !== "all" && queueStatus !== statusFilter) {
      continue
    }

    const workflows = getVendorWorkflows(row.order_metadata)
    const workflow = workflows[vendorId] || {}
    const meta = getReturnMetadata(request)

    items.push({
      return_id: row.id,
      order_id: row.order_id,
      order_display_id: row.display_id ?? null,
      vendor_id: vendorId,
      vendor_name: workflow.vendor_name || null,
      store_name: workflow.store_name || null,
      return_status: String(row.status),
      reason: row.reason,
      approved_at: row.approved_at,
      pickup_initiated_at: row.pickup_initiated_at,
      picked_up_at: row.picked_up_at,
      received_at: row.received_at,
      customer_pickup_pincode: row.shipping_postal_code
        ? String(row.shipping_postal_code).replace(/\D/g, "")
        : null,
      vendor_delivery_pincode: workflow.easy_pickup_pincode || null,
      shiprocket_awb: row.shiprocket_awb,
      shiprocket_status: row.shiprocket_status,
      reverse_courier_name:
        meta.reverse_courier_name || workflow.return_courier_name || null,
      reverse_courier_rate:
        meta.reverse_courier_rate != null
          ? Number(meta.reverse_courier_rate)
          : workflow.return_courier_rate != null
            ? Number(workflow.return_courier_rate)
            : null,
      admin_return_booked_at: meta.admin_return_booked_at
        ? String(meta.admin_return_booked_at)
        : null,
      created_at: row.created_at,
      status: queueStatus,
    })
  }

  items.sort((a, b) => {
    const rank = (s: ReturnPacketBookingQueueStatus) => (s === "awaiting_booking" ? 0 : 1)
    const rd = rank(a.status) - rank(b.status)
    if (rd !== 0) return rd
    const ta = a.approved_at || a.created_at || ""
    const tb = b.approved_at || b.created_at || ""
    return tb.localeCompare(ta)
  })

  return items.slice(0, limit)
}

export async function loadReturnPacketBookingDetail(
  req: MedusaRequest,
  returnId: string
) {
  const returnService: ReturnModuleService = req.scope.resolve(RETURN_MODULE)
  const requests = await returnService.listReturnRequests({ id: returnId })
  if (!requests.length) return null

  const request = requests[0]
  const pool = getSharedDbPool()
  const { rows } = await pool.query<{
    display_id: string | number | null
    metadata: any
    email: string | null
    shipping_postal_code: string | null
    shipping_address_1: string | null
    shipping_address_2: string | null
    shipping_city: string | null
    shipping_province: string | null
    shipping_first_name: string | null
    shipping_last_name: string | null
    shipping_phone: string | null
  }>(
    `
      SELECT
        o.display_id,
        o.metadata,
        o.email,
        sa.postal_code AS shipping_postal_code,
        sa.address_1 AS shipping_address_1,
        sa.address_2 AS shipping_address_2,
        sa.city AS shipping_city,
        sa.province AS shipping_province,
        sa.first_name AS shipping_first_name,
        sa.last_name AS shipping_last_name,
        sa.phone AS shipping_phone
      FROM "order" o
      LEFT JOIN order_address sa ON sa.id = o.shipping_address_id
      WHERE o.id = $1 AND o.deleted_at IS NULL
      LIMIT 1
    `,
    [request.order_id]
  )

  const orderRow = rows[0]
  if (!orderRow) return null

  const order = {
    id: request.order_id,
    display_id: orderRow.display_id,
    email: orderRow.email,
    metadata: orderRow.metadata,
    shipping_address: {
      postal_code: orderRow.shipping_postal_code,
      address_1: orderRow.shipping_address_1,
      address_2: orderRow.shipping_address_2,
      city: orderRow.shipping_city,
      province: orderRow.shipping_province,
      first_name: orderRow.shipping_first_name,
      last_name: orderRow.shipping_last_name,
      phone: orderRow.shipping_phone,
    },
  }

  const vendorId = await resolveReturnVendorId(req, order, request)
  if (!vendorId || !isVendorEasyShipOrder(order, vendorId)) {
    return { error: "not_easy_ship" as const, request, order }
  }

  const returnItems = await returnService.listReturnRequestItems({
    return_request_id: request.id,
  })

  return {
    request,
    order,
    vendorId,
    returnItems,
    workflow: getVendorWorkflows(orderRow.metadata)[vendorId] || {},
  }
}

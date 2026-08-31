import { getSharedDbPool } from "./db-pool"
import {
  getPaymentType,
  getVendorWorkflows,
  type VendorOrderWorkflow,
} from "./vendor-order-workflow"

export type PacketBookingQueueStatus =
  | "waiting_rtd"
  | "awaiting_booking"
  | "booked"

export type PacketBookingQueueItem = {
  order_id: string
  order_display_id: string | number | null
  vendor_id: string
  vendor_name: string | null
  store_name: string | null
  vendor_email: string | null
  payment_type: string
  stage: string | null
  rtd_at: string | null
  invoice_generated_at: string | null
  easy_booking_status: string | null
  preferred_courier_id: number | null
  preferred_courier_partner: string | null
  preferred_courier_rate: number | null
  pickup_pincode: string | null
  pickup_location: string | null
  package_weight: number | null
  package_length: number | null
  package_breadth: number | null
  package_height: number | null
  shipping_provider: string | null
  shiprocket_awb: string | null
  tracking_number: string | null
  admin_booked_at: string | null
  created_at: string | null
  currency_code: string | null
  status: PacketBookingQueueStatus
}

/**
 * Scan Easy Ship vendor workflows for admin Packet Booking.
 * - waiting_rtd: Easy chosen, invoice optional, RTD not done yet
 * - awaiting_booking: RTD done, admin must book courier
 * - booked: AWB / admin booking done
 */
export async function listPacketBookingQueue(opts?: {
  status?: PacketBookingQueueStatus | "all" | "open"
  limit?: number
}): Promise<PacketBookingQueueItem[]> {
  const statusFilter = opts?.status || "open"
  const limit = Math.min(Math.max(Number(opts?.limit) || 100, 1), 300)
  const pool = getSharedDbPool()

  const { rows } = await pool.query<{
    id: string
    display_id: string | number | null
    metadata: any
    currency_code: string | null
    created_at: string | null
  }>(
    `
      SELECT id, display_id, metadata, currency_code, created_at
      FROM "order"
      WHERE deleted_at IS NULL
        AND metadata ? 'vendor_order_workflows'
        AND metadata::text ~* '"shipping_method"[[:space:]]*:[[:space:]]*"easy"'
      ORDER BY updated_at DESC NULLS LAST
      LIMIT $1
    `,
    [Math.max(limit * 4, 200)]
  )

  const items: PacketBookingQueueItem[] = []

  for (const row of rows || []) {
    const workflows = getVendorWorkflows(row.metadata)
    const paymentType = getPaymentType({ metadata: row.metadata } as any)

    for (const [vendorId, workflow] of Object.entries(workflows) as Array<
      [string, VendorOrderWorkflow]
    >) {
      if (workflow?.shipping_method !== "easy") continue

      const booked = Boolean(
        workflow.shiprocket_awb ||
          workflow.easy_booking_status === "booked" ||
          workflow.admin_booked_at
      )

      let status: PacketBookingQueueStatus | null = null
      if (booked) {
        status = "booked"
      } else if (workflow.rtd_at) {
        status = "awaiting_booking"
      } else if (
        workflow.easy_booking_status === "intent" ||
        workflow.stage === "to_pack"
      ) {
        status = "waiting_rtd"
      }
      if (!status) continue

      if (statusFilter === "open") {
        if (status === "booked") continue
      } else if (statusFilter !== "all" && status !== statusFilter) {
        continue
      }

      items.push({
        order_id: row.id,
        order_display_id: row.display_id ?? null,
        vendor_id: vendorId,
        vendor_name: workflow.vendor_name || null,
        store_name: workflow.store_name || null,
        vendor_email: workflow.vendor_email || null,
        payment_type: paymentType,
        stage: workflow.stage || null,
        rtd_at: workflow.rtd_at || null,
        invoice_generated_at: workflow.invoice_generated_at || null,
        easy_booking_status: workflow.easy_booking_status || null,
        preferred_courier_id: workflow.easy_courier_id ?? null,
        preferred_courier_partner: workflow.easy_courier_partner || null,
        preferred_courier_rate: workflow.easy_courier_rate ?? null,
        pickup_pincode: workflow.easy_pickup_pincode || null,
        pickup_location: workflow.easy_pickup_location || null,
        package_weight: workflow.easy_package_weight ?? null,
        package_length: workflow.easy_package_length ?? null,
        package_breadth: workflow.easy_package_breadth ?? null,
        package_height: workflow.easy_package_height ?? null,
        shipping_provider: workflow.shipping_provider || null,
        shiprocket_awb: workflow.shiprocket_awb || null,
        tracking_number: workflow.tracking_number || null,
        admin_booked_at: workflow.admin_booked_at || null,
        created_at: row.created_at || null,
        currency_code: row.currency_code || null,
        status,
      })
    }
  }

  const rank = (s: PacketBookingQueueStatus) =>
    s === "awaiting_booking" ? 0 : s === "waiting_rtd" ? 1 : 2

  items.sort((a, b) => {
    const rd = rank(a.status) - rank(b.status)
    if (rd !== 0) return rd
    const ta = a.rtd_at || a.invoice_generated_at || a.created_at || ""
    const tb = b.rtd_at || b.invoice_generated_at || b.created_at || ""
    return tb.localeCompare(ta)
  })

  return items.slice(0, limit)
}

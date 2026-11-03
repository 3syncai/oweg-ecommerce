import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getSharedDbPool } from "../../../../lib/db-pool"
import { scheduleVendorEarningsOnDelivery } from "../../../../lib/vendor-earnings"

/**
 * POST /admin/vendor-earnings/schedule-delivery
 * Admin/debug helper — schedules unlock timer for delivered orders.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body || {}) as {
    order_id?: string
    delivered_at?: string
    vendor_ids?: string[]
  }
  const orderId = String(body.order_id || "").trim()
  if (!orderId) {
    return res.status(400).json({ message: "order_id is required" })
  }

  const deliveredAt = body.delivered_at ? new Date(body.delivered_at) : undefined
  if (deliveredAt && Number.isNaN(deliveredAt.getTime())) {
    return res.status(400).json({ message: "delivered_at is invalid" })
  }

  const vendorIds = Array.isArray(body.vendor_ids)
    ? body.vendor_ids.map((id) => String(id || "").trim()).filter(Boolean)
    : undefined

  try {
    const result = await scheduleVendorEarningsOnDelivery(
      orderId,
      getSharedDbPool(),
      {
        ...(deliveredAt ? { deliveredAt } : {}),
        ...(vendorIds?.length ? { vendorIds } : {}),
      }
    )
    return res.json({ success: true, result })
  } catch (error: any) {
    console.error("[admin vendor-earnings schedule-delivery]", error)
    return res.status(500).json({
      message: error?.message || "Failed to schedule vendor earnings",
    })
  }
}

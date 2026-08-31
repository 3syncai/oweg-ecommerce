import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listPacketBookingQueue } from "../../../lib/packet-booking-queue"

/**
 * GET /admin/packet-booking
 * Queue of Easy Ship orders for admin packet booking.
 * Query: status=awaiting_booking|booked|all
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const statusRaw = String((req.query as any)?.status || "awaiting_booking").trim()
    const status =
      statusRaw === "booked" || statusRaw === "all" || statusRaw === "awaiting_booking"
        ? statusRaw
        : "awaiting_booking"
    const limit = Number((req.query as any)?.limit) || 100

    const items = await listPacketBookingQueue({ status, limit })
    return res.json({
      items,
      count: items.length,
      status,
    })
  } catch (error: any) {
    console.error("[admin packet-booking] list error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to load packet booking queue",
    })
  }
}

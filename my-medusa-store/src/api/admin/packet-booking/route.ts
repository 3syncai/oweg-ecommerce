import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listPacketBookingQueue } from "../../../lib/packet-booking-queue"

/**
 * GET /admin/packet-booking
 * Query: status=open|waiting_rtd|awaiting_booking|booked|all
 * Default: open (waiting_rtd + awaiting_booking)
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const statusRaw = String((req.query as any)?.status || "open").trim()
    const allowed = new Set([
      "open",
      "waiting_rtd",
      "awaiting_booking",
      "booked",
      "all",
    ])
    const status = allowed.has(statusRaw) ? (statusRaw as any) : "open"
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

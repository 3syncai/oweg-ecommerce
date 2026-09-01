import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listReturnPacketBookingQueue } from "../../../lib/return-packet-booking-queue"

/**
 * GET /admin/return-packet-booking
 * Query: status=open|awaiting_booking|booked|all
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const statusRaw = String((req.query as any)?.status || "open").trim()
    const allowed = new Set(["open", "awaiting_booking", "booked", "all"])
    const status = allowed.has(statusRaw) ? (statusRaw as any) : "open"
    const limit = Number((req.query as any)?.limit) || 100

    const items = await listReturnPacketBookingQueue(req, { status, limit })
    return res.json({
      items,
      count: items.length,
      status,
    })
  } catch (error: any) {
    console.error("[admin return-packet-booking] list error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to load return packet booking queue",
    })
  }
}

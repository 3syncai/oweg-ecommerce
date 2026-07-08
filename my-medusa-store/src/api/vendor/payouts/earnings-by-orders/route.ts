import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../../_lib/guards"
import { getVendorEarningsByOrderIds, syncVendorEarningsStatuses } from "../../../../lib/vendor-earnings"

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

/**
 * GET /vendor/payouts/earnings-by-orders?order_ids=id1,id2
 * Returns earnings rows keyed by order id (for orders list timers).
 */
export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const raw = req.query.order_ids
  const orderIds =
    typeof raw === "string"
      ? raw.split(",").map((id) => id.trim()).filter(Boolean)
      : Array.isArray(raw)
        ? raw.flatMap((value) => String(value).split(",")).map((id) => id.trim()).filter(Boolean)
        : []

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    await syncVendorEarningsStatuses(pool)
    const earnings = await getVendorEarningsByOrderIds(auth.vendor_id, orderIds, pool)
    res.json({ earnings })
  } catch (error: any) {
    console.error("[Vendor earnings-by-orders] error:", error)
    res.status(500).json({
      message: "Failed to load order earnings",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

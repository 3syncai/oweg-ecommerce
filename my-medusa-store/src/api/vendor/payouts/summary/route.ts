import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../../_lib/guards"
import {
  getVendorEarningsByOrderIds,
  getVendorEarningsSummary,
  syncVendorEarningsStatuses,
} from "../../../../lib/vendor-earnings"

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

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL })
}

/**
 * GET /vendor/payouts/summary
 * Returns available balance, unlocking timers, and recent credited earnings.
 */
export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const pool = getPool()

  try {
    const summary = await getVendorEarningsSummary(auth.vendor_id, pool)
    res.json({
      summary,
      unlock_minutes: 5,
    })
  } catch (error: any) {
    console.error("[Vendor Payout Summary] error:", error)
    res.status(500).json({
      message: "Failed to load payout summary",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

/**
 * POST /vendor/payouts/summary
 * Sync unlocking earnings to credited (same as GET, useful for polling).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const pool = getPool()

  try {
    const promoted = await syncVendorEarningsStatuses(pool)
    const summary = await getVendorEarningsSummary(auth.vendor_id, pool)
    res.json({
      promoted,
      summary,
      unlock_minutes: 5,
    })
  } catch (error: any) {
    console.error("[Vendor Payout Sync] error:", error)
    res.status(500).json({
      message: "Failed to sync payout summary",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

export { getVendorEarningsByOrderIds, getVendorEarningsSummary, syncVendorEarningsStatuses }

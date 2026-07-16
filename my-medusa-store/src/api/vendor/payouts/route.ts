import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../_lib/guards"
import {
  getVendorEarningsByOrderIds,
  getVendorEarningsSummary,
  syncVendorEarningsStatuses,
} from "../../../lib/vendor-earnings"

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

function parseOrderIds(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  }
  if (Array.isArray(raw)) {
    return raw
      .flatMap((value) => String(value).split(","))
      .map((id) => id.trim())
      .filter(Boolean)
  }
  return []
}

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

/**
 * GET /vendor/payouts
 *
 * Default: earnings summary + 5-minute unlock timers (pending → available).
 * Optional: ?order_ids=id1,id2 → per-order earnings map (orders page timers).
 * Legacy payouts list is included when available for older UIs.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const pool = getPool()
  const orderIds = parseOrderIds(req.query?.order_ids)

  try {
    await syncVendorEarningsStatuses(pool)

    if (orderIds.length > 0) {
      const earnings = await getVendorEarningsByOrderIds(auth.vendor_id, orderIds, pool)
      res.json({ earnings, unlock_minutes: 5 })
      return
    }

    const summary = await getVendorEarningsSummary(auth.vendor_id, pool)

    // Load payout rows via SQL (same table admin writes to) so notifications see Pay Now instantly.
    let payouts: unknown[] = []
    let totals = { total_credited: 0, total_commission: 0, total_gross: 0 }
    try {
      const result = await pool.query(
        `
          SELECT
            id,
            amount,
            commission_amount,
            net_amount,
            commission_rate,
            currency_code,
            transaction_id,
            payment_method,
            status,
            notes,
            order_ids,
            created_at,
            updated_at
          FROM vendor_payout
          WHERE vendor_id = $1
          ORDER BY created_at DESC
          LIMIT 100
        `,
        [auth.vendor_id]
      )
      payouts = result.rows || []
      totals = (payouts as any[]).reduce(
        (acc, payout) => {
          if (String(payout.status || "").toLowerCase() === "processed") {
            acc.total_credited += Number(payout.net_amount) || 0
            acc.total_commission += Number(payout.commission_amount) || 0
            acc.total_gross += Number(payout.amount) || 0
          }
          return acc
        },
        { total_credited: 0, total_commission: 0, total_gross: 0 }
      )
    } catch (error: unknown) {
      const pgError = error as { code?: string }
      if (pgError?.code !== "42P01") {
        console.warn("Vendor payouts list query failed:", error)
      }
      // Table missing — earnings summary is still the source of truth
    }

    res.json({
      summary,
      unlock_minutes: 5,
      payouts,
      totals,
      count: payouts.length,
    })
  } catch (error: any) {
    console.error("Vendor payouts fetch error:", error)
    res.status(500).json({
      message: "Failed to fetch payouts",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

/**
 * POST /vendor/payouts
 * Force-sync UNLOCKING → CREDITED after the 5-minute timer, then return summary.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
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
    console.error("Vendor payouts sync error:", error)
    res.status(500).json({
      message: "Failed to sync payouts",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

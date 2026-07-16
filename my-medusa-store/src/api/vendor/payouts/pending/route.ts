import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../../_lib/guards"
import {
  getVendorEarningsByOrderIds,
  getVendorEarningsSummary,
  syncVendorEarningsStatuses,
} from "../../../../lib/vendor-earnings"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import VendorModuleService from "../../../../modules/vendor/service"
import {
  getVendorCommissionDefaultRate,
  resolveVendorCommissionRate,
} from "../../../../lib/vendor-commission"

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
 * GET /vendor/payouts/pending
 * Compat endpoint (exists on older hosted builds). Same earnings summary + timers.
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

    const vendorModuleService = req.scope.resolve(VENDOR_MODULE) as VendorModuleService
    const [vendor, globalDefault] = await Promise.all([
      vendorModuleService.listVendors({ id: auth.vendor_id }).then(([v]) => v),
      getVendorCommissionDefaultRate(pool),
    ])
    const resolved = resolveVendorCommissionRate(
      {
        commission_override:
          (vendor as { commission_override?: boolean } | undefined)?.commission_override === true,
        commission_rate: vendor?.commission_rate ?? null,
      },
      globalDefault
    )
    const commission_rate = resolved.rate

    const summary = await getVendorEarningsSummary(auth.vendor_id, pool)

    res.json({
      pending: {
        gross_amount: summary.available_balance + summary.unlocking_balance,
        commission_amount:
          (summary.available_balance + summary.unlocking_balance) * (commission_rate / 100),
        net_amount: summary.available_balance,
        unlocking_amount: summary.unlocking_balance,
        order_count: summary.unlocking.length + summary.credited_recent.length,
        commission_rate,
        commission_source: resolved.source,
      },
      summary,
      unlock_minutes: 5,
    })
  } catch (error: any) {
    console.error("Pending payout calculation error:", error)
    res.status(500).json({
      message: "Failed to calculate pending payout",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

/**
 * POST /vendor/payouts/pending — sync timers then return summary.
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
    console.error("Pending payout sync error:", error)
    res.status(500).json({
      message: "Failed to sync pending payout",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

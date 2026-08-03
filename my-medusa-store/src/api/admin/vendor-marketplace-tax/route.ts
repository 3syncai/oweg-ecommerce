import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import {
  getMarketplaceTaxRates,
  setMarketplaceTaxRates,
  DEFAULT_MARKETPLACE_TCS_RATE,
  DEFAULT_MARKETPLACE_TDS_RATE,
} from "../../../lib/vendor-marketplace-tax"

function getPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL })
}

/**
 * GET /admin/vendor-marketplace-tax
 * Returns platform TCS / TDS rates (Amazon/Flipkart-style marketplace defaults).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pool = getPool()
  try {
    const rates = await getMarketplaceTaxRates(pool)
    res.json({
      ...rates,
      defaults: {
        tcs_rate: DEFAULT_MARKETPLACE_TCS_RATE,
        tds_rate: DEFAULT_MARKETPLACE_TDS_RATE,
      },
      notes: {
        tcs: "GST TCS under CGST s.52 on taxable (ex-GST) value",
        tds: "Income-tax TDS under s.194-O on taxable value (same rate for all vendors)",
        base: "Applied after GST inclusive split; shipping excluded from base (v1)",
      },
    })
  } catch (error: any) {
    console.error("[admin marketplace-tax] GET error:", error)
    res.status(500).json({
      message: "Failed to load marketplace tax rates",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

/**
 * PUT /admin/vendor-marketplace-tax
 * Body: { tcs_rate?, tds_rate? }
 */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body || {}) as {
    tcs_rate?: number
    tds_rate?: number
  }

  const pool = getPool()
  try {
    const rates = await setMarketplaceTaxRates(pool, body)
    res.json({ rates, message: "Marketplace tax rates saved" })
  } catch (error: any) {
    console.error("[admin marketplace-tax] PUT error:", error)
    res.status(500).json({
      message: "Failed to save marketplace tax rates",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../_lib/guards"
import VendorModuleService from "../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../modules/vendor"
import {
  buildVendorCommissionInvoice,
  type CommissionInvoiceRange,
} from "../../../lib/vendor-commission-invoice"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.VENDOR_CORS || "http://localhost:4000"
  )
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

const ALLOWED_RANGES = new Set([
  "today",
  "1m",
  "3m",
  "6m",
  "1y",
  "last_month",
  "month",
  "custom",
  "all",
])

/**
 * GET /vendor/commission-invoices?range=...&from=&to=&month=&year=
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const q = (req.query || {}) as Record<string, string>
  const rangeRaw = String(q.range || "month").trim().toLowerCase()
  const range = (ALLOWED_RANGES.has(rangeRaw) ? rangeRaw : "month") as CommissionInvoiceRange
  const from = String(q.from || "").trim()
  const to = String(q.to || "").trim()
  const month = String(q.month || "").trim()
  const year = String(q.year || "").trim()

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ message: "DATABASE_URL is not configured" })
  }

  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    const vendor = await vendorService.retrieveVendor(auth.vendor_id)
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })

    try {
      const payload = await buildVendorCommissionInvoice(
        auth.vendor_id,
        vendor as Record<string, unknown>,
        pool,
        range,
        from || undefined,
        to || undefined,
        {
          preferSnapshot: range === "last_month" || range === "month",
          month: month || undefined,
          year: year || undefined,
        }
      )

      if ("error" in payload) {
        return res.status(400).json({ message: payload.error })
      }

      return res.json(payload)
    } finally {
      await pool.end().catch(() => undefined)
    }
  } catch (error: any) {
    console.error("[vendor commission-invoices] error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to load commission invoice data",
    })
  }
}

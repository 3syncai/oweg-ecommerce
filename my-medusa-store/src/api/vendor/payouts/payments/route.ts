import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { requireApprovedVendor } from "../../_lib/guards"
import { getVendorPaymentsView } from "../../../../lib/vendor-earnings"

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

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const data = await getVendorPaymentsView(auth.vendor_id, pool)
    res.json(data)
  } catch (error: any) {
    console.error("[Vendor Payments] error:", error)
    res.status(500).json({
      message: "Failed to load payments",
      error: error?.message || "Unknown error",
    })
  } finally {
    await pool.end().catch(() => {})
  }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../_lib/guards"
import {
  GST_TAX_CODES,
  searchGstTaxCodes,
  suggestGstTaxCode,
  findGstTaxCode,
} from "../../../../lib/gst-tax-codes"

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

/**
 * GET /vendor/gst/tax-codes
 * Query:
 *   q        — filter codes (e.g. "18", "GST_5")
 *   suggest  — product title / description for a best-effort suggestion
 *   category — optional category name for suggestion
 *
 * Returns Flipkart-style GST tax codes. No third-party GST API key required.
 * Optional FASTGST_API_KEY can be added later for live HSN lookup — not used today.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const q = String((req.query as any)?.q || "").trim()
    const suggest = String((req.query as any)?.suggest || "").trim()
    const category = String((req.query as any)?.category || "").trim()

    const tax_codes = searchGstTaxCodes(q)
    const suggested = suggest
      ? suggestGstTaxCode({ title: suggest, category })
      : null

    return res.json({
      tax_codes,
      count: tax_codes.length,
      suggested,
      source: "oweg_static",
      note:
        "Tax codes decide the GST rate for the listing. Rates are curated for seller selection; verify against current GST notifications for your HSN.",
      all_codes: GST_TAX_CODES.map((c) => c.code),
      resolved: q ? findGstTaxCode(q) : null,
    })
  } catch (error: any) {
    console.error("[vendor/gst/tax-codes]", error)
    return res.status(500).json({
      message: error?.message || "Failed to load GST tax codes",
    })
  }
}

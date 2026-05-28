import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireVendorAuth } from "../_lib/guards"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export const OPTIONS = async (_req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  return res.status(200).end()
}

/**
 * Lists product types for the vendor portal so the bulk-upload UI can
 * power its Type combobox. Vendors can pick an existing one or send a
 * new value at create time — the products POST route auto-creates types
 * that don't exist yet.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  try {
    const vendorId = await requireVendorAuth(req)
    if (!vendorId) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const { limit = 200, offset = 0 } = req.query
    const query = req.scope.resolve("query")

    const { data: types, metadata } = await query.graph({
      entity: "product_type",
      fields: ["id", "value", "metadata", "created_at", "updated_at"],
      pagination: {
        skip: Number(offset),
        take: Number(limit),
      },
    })

    return res.json({
      product_types: types || [],
      count: metadata?.count || 0,
      offset: Number(offset),
      limit: Number(limit),
    })
  } catch (error) {
    console.error("Error fetching product types:", error)
    return res.status(500).json({
      message: "Failed to fetch product types",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

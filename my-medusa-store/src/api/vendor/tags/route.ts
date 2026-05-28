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
 * Lists product tags for the vendor portal so the bulk-upload UI can
 * suggest existing tags as the vendor types. New tag values typed by
 * the vendor are auto-created by the products POST route.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  try {
    const vendorId = await requireVendorAuth(req)
    if (!vendorId) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const { limit = 500, offset = 0 } = req.query
    const query = req.scope.resolve("query")

    const { data: tags, metadata } = await query.graph({
      entity: "product_tag",
      fields: ["id", "value", "metadata", "created_at", "updated_at"],
      pagination: {
        skip: Number(offset),
        take: Number(limit),
      },
    })

    return res.json({
      product_tags: tags || [],
      count: metadata?.count || 0,
      offset: Number(offset),
      limit: Number(limit),
    })
  } catch (error) {
    console.error("Error fetching product tags:", error)
    return res.status(500).json({
      message: "Failed to fetch product tags",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

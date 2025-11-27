import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireVendorAuth } from "../_lib/guards"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export const OPTIONS = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  return res.status(200).end()
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  setCorsHeaders(res)
  try {
    // Verify vendor authentication
    const vendorId = await requireVendorAuth(req)
    if (!vendorId) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    // Get query parameters
    const { limit = 100, offset = 0 } = req.query

    // Fetch all collections
    const query = req.scope.resolve("query")
    
    const { data: collections, metadata } = await query.graph({
      entity: "product_collection",
      fields: [
        "id",
        "title",
        "handle",
        "created_at",
        "updated_at",
        "products.*",
      ],
      pagination: {
        skip: Number(offset),
        take: Number(limit),
      },
    })

    return res.json({
      collections: collections || [],
      count: metadata?.count || 0,
      offset: Number(offset),
      limit: Number(limit),
    })
  } catch (error) {
    console.error("Error fetching collections:", error)
    return res.status(500).json({
      message: "Failed to fetch collections",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}


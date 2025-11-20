import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireVendorAuth } from "../_lib/guards"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    // Verify vendor authentication
    const vendorId = await requireVendorAuth(req)
    if (!vendorId) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    // Get query parameters
    const { limit = 100, offset = 0 } = req.query

    // Fetch all product categories
    const query = req.scope.resolve("query")
    
    const { data: categories, metadata } = await query.graph({
      entity: "product_category",
      fields: [
        "id",
        "name",
        "handle",
        "is_active",
        "is_internal",
        "parent_category_id",
        "rank",
        "created_at",
        "updated_at",
      ],
      pagination: {
        skip: Number(offset),
        take: Number(limit),
      },
    })

    return res.json({
      product_categories: categories || [],
      count: metadata?.count || 0,
      offset: Number(offset),
      limit: Number(limit),
    })
  } catch (error) {
    console.error("Error fetching categories:", error)
    return res.status(500).json({
      message: "Failed to fetch categories",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}


import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  serializeFeaturedBrand,
  sortFeaturedBrands,
  type FeaturedBrandCollection,
} from "../../../lib/featured-brands"

const COLLECTION_FIELDS = ["id", "title", "handle", "metadata", "created_at"]

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const query = req.scope.resolve("query")
    const { data: collections } = await query.graph({
      entity: "product_collection",
      fields: COLLECTION_FIELDS,
      pagination: { skip: 0, take: 500 },
    })

    const rows = sortFeaturedBrands((collections || []) as FeaturedBrandCollection[]).map(
      serializeFeaturedBrand
    )

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")

    return res.json({
      collections: rows,
      count: rows.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch brand collections"
    console.error("GET /store/brand-collections failed:", error)
    return res.status(500).json({ message })
  }
}

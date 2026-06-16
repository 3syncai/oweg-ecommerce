import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  isFeaturedOnHomepage,
  serializeFeaturedBrand,
  sortFeaturedBrands,
  type FeaturedBrandCollection,
} from "../../../lib/featured-brands"

const COLLECTION_FIELDS = ["id", "title", "handle", "metadata"]

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const query = req.scope.resolve("query")
    const { data: collections } = await query.graph({
      entity: "product_collection",
      fields: COLLECTION_FIELDS,
      pagination: { skip: 0, take: 500 },
    })

    const featured = sortFeaturedBrands(
      ((collections || []) as FeaturedBrandCollection[]).filter((collection) =>
        isFeaturedOnHomepage(collection.metadata)
      )
    ).map(serializeFeaturedBrand)

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")

    return res.json({
      collections: featured,
      count: featured.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch featured brands"
    console.error("GET /store/featured-brands failed:", error)
    return res.status(500).json({ message })
  }
}

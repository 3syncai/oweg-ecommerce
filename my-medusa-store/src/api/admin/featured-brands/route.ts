import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  serializeFeaturedBrand,
  sortFeaturedBrands,
  type FeaturedBrandCollection,
} from "../../../lib/featured-brands"

const COLLECTION_FIELDS = ["id", "title", "handle", "metadata", "created_at", "updated_at"]

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

    return res.json({
      collections: rows,
      count: rows.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list featured brands"
    console.error("GET /admin/featured-brands failed:", error)
    return res.status(500).json({ message })
  }
}

export async function retrieveCollectionById(req: MedusaRequest, id: string) {
  const query = req.scope.resolve("query")
  const { data } = await query.graph({
    entity: "product_collection",
    fields: COLLECTION_FIELDS,
    filters: { id },
  })
  return (data?.[0] || null) as FeaturedBrandCollection | null
}

export async function updateCollectionMetadata(
  req: MedusaRequest,
  id: string,
  metadata: Record<string, unknown>
) {
  const productModuleService = req.scope.resolve(Modules.PRODUCT)
  return productModuleService.updateProductCollections(id, { metadata })
}

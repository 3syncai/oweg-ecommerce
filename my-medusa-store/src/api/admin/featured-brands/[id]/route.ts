import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  mergeCollectionMetadata,
  serializeFeaturedBrand,
  type FeaturedBrandMetadata,
} from "../../../../lib/featured-brands"
import {
  retrieveCollectionById,
  updateCollectionMetadata,
} from "../route"

type PatchBody = {
  featured_on_homepage?: boolean
  homepage_rank?: number | string
  brand_logo_scale?: number | string
}

function parseNumericField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { id } = req.params as { id: string }
    if (!id) {
      return res.status(400).json({ message: "Collection id is required" })
    }

    const body = (req.body || {}) as PatchBody
    const collection = await retrieveCollectionById(req, id)
    if (!collection) {
      return res.status(404).json({ message: "Collection not found" })
    }

    const existing = (collection.metadata || {}) as FeaturedBrandMetadata
    const patch: Partial<FeaturedBrandMetadata> = {}

    if (typeof body.featured_on_homepage === "boolean") {
      patch.featured_on_homepage = body.featured_on_homepage
    }

    const homepageRank = parseNumericField(body.homepage_rank)
    if (homepageRank !== undefined) {
      patch.homepage_rank = homepageRank
    }

    const brandLogoScale = parseNumericField(body.brand_logo_scale)
    if (brandLogoScale !== undefined && brandLogoScale > 0) {
      patch.brand_logo_scale = brandLogoScale
    }

    const metadata = mergeCollectionMetadata(existing, patch)
    await updateCollectionMetadata(req, id, metadata)

    const updated = await retrieveCollectionById(req, id)
    return res.json({ collection: serializeFeaturedBrand(updated!) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update featured brand"
    console.error("PATCH /admin/featured-brands/:id failed:", error)
    return res.status(500).json({ message })
  }
}

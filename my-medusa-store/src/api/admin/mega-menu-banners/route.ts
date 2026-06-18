import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  serializeCategoryWithBanners,
} from "../../../lib/mega-menu-banners"
import { listAllCategories } from "../../../lib/mega-menu-banner-category"

export { retrieveCategoryById, retrieveCategoryByHandle, updateCategoryMetadata } from "../../../lib/mega-menu-banner-category"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const categories = await listAllCategories(req)

    const serialized = categories
      .map(serializeCategoryWithBanners)
      .sort((a, b) => a.name.localeCompare(b.name))

    return res.json({
      categories: serialized,
      count: serialized.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list mega menu banners"
    console.error("GET /admin/mega-menu-banners failed:", error)
    return res.status(500).json({ message })
  }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  getActiveStorefrontBanners,
  serializeMegaMenuBanner,
} from "../../../lib/mega-menu-banners"
import { retrieveCategoryByHandle } from "../../../lib/mega-menu-banner-category"

function parseQueryString(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value) && typeof value[0] === "string") return value[0]
  return ""
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const handle = parseQueryString(req.query.handle).trim()
    if (!handle) {
      return res.status(400).json({ message: "handle query parameter is required" })
    }

    const category = await retrieveCategoryByHandle(req, handle)
    if (!category) {
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
      return res.json({ banners: [], count: 0, handle })
    }

    const banners = getActiveStorefrontBanners(category.metadata).map((banner) =>
      serializeMegaMenuBanner(banner, category.name || "")
    )

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")

    return res.json({
      handle: category.handle || handle,
      category_id: category.id,
      banners,
      count: banners.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch mega menu banners"
    console.error("GET /store/mega-menu-banners failed:", error)
    return res.status(500).json({ message })
  }
}

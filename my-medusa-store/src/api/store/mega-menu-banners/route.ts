import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  getActiveStorefrontBanners,
  serializeMegaMenuBanner,
} from "../../../lib/mega-menu-banners"
import { retrieveCategoryByHandle } from "../../../lib/mega-menu-banner-category"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const handle =
      typeof req.query.handle === "string"
        ? req.query.handle
        : Array.isArray(req.query.handle)
          ? req.query.handle[0]
          : ""

    if (!handle?.trim()) {
      return res.status(400).json({ message: "handle query parameter is required" })
    }

    const category = await retrieveCategoryByHandle(req, handle.trim())
    if (!category) {
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
      return res.json({ banners: [], count: 0, handle: handle.trim() })
    }

    const banners = getActiveStorefrontBanners(category.metadata).map(serializeMegaMenuBanner)

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")

    return res.json({
      handle: category.handle || handle.trim(),
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

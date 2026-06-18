import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  listSubcategoriesByParentId,
  retrieveCategoryById,
} from "../../../../../lib/mega-menu-banner-category"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { categoryId } = req.params as { categoryId: string }
    if (!categoryId) {
      return res.status(400).json({ message: "Category id is required" })
    }

    const category = await retrieveCategoryById(req, categoryId)
    if (!category) {
      return res.status(404).json({ message: "Category not found" })
    }

    const subcategories = await listSubcategoriesByParentId(req, categoryId)
    return res.json({ subcategories })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load subcategories"
    console.error("GET /admin/mega-menu-banners/:categoryId/subcategories failed:", error)
    return res.status(500).json({ message })
  }
}

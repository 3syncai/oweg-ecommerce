import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import s3Service from "../../../../../../services/s3-service"
import {
  findBannerInMetadata,
  parseBooleanField,
  parseNumericField,
  parseRedirectTarget,
  removeBannerFromMetadata,
  resolveRedirectSelection,
  serializeCategoryWithBanners,
  serializeMegaMenuBanner,
  upsertBannerInMetadata,
  type CategoryMegaMenuBannerMetadata,
  type MegaMenuBanner,
  type MegaMenuRedirectTarget,
} from "../../../../../../lib/mega-menu-banners"
import {
  listSubcategoriesByParentId,
  retrieveCategoryById,
  updateCategoryMetadata,
} from "../../../../../../lib/mega-menu-banner-category"

type PatchBody = {
  redirect_target?: MegaMenuRedirectTarget
  subcategory_handle?: string
  priority?: number | string
  enabled?: boolean | string
  alt_text?: string
  open_in_new_tab?: boolean | string
}

export const PATCH = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { categoryId, bannerId } = req.params as { categoryId: string; bannerId: string }
    if (!categoryId || !bannerId) {
      return res.status(400).json({ message: "Category id and banner id are required" })
    }

    const category = await retrieveCategoryById(req, categoryId)
    if (!category) {
      return res.status(404).json({ message: "Category not found" })
    }

    const existingMeta = (category.metadata || {}) as CategoryMegaMenuBannerMetadata
    const existingBanner = findBannerInMetadata(existingMeta, bannerId)
    if (!existingBanner) {
      return res.status(404).json({ message: "Banner not found" })
    }

    const body = (req.body || {}) as PatchBody
    const nextBanner: MegaMenuBanner = {
      ...existingBanner,
      updated_at: new Date().toISOString(),
    }

    const redirectTargetChanged = body.redirect_target !== undefined
    const subcategoryHandleChanged = body.subcategory_handle !== undefined

    if (redirectTargetChanged || subcategoryHandleChanged) {
      const redirectTarget =
        parseRedirectTarget(body.redirect_target) ||
        existingBanner.redirect_target ||
        "parent"

      const parentHandle = category.handle || ""
      if (!parentHandle) {
        return res.status(400).json({ message: "Category handle is required to build redirect URL" })
      }

      const subcategories = await listSubcategoriesByParentId(req, categoryId)
      try {
        const redirectSelection = resolveRedirectSelection({
          parentHandle,
          parentName: category.name || parentHandle,
          redirectTarget,
          subcategoryHandle:
            subcategoryHandleChanged && typeof body.subcategory_handle === "string"
              ? body.subcategory_handle
              : existingBanner.subcategory_handle,
          subcategories,
        })
        nextBanner.link_url = redirectSelection.link_url
        nextBanner.redirect_target = redirectSelection.redirect_target
        nextBanner.subcategory_handle = redirectSelection.subcategory_handle
        nextBanner.subcategory_name = redirectSelection.subcategory_name
      } catch (redirectError: unknown) {
        const message =
          redirectError instanceof Error ? redirectError.message : "Invalid redirect selection"
        return res.status(400).json({ message })
      }
    }

    if (body.priority !== undefined) {
      nextBanner.priority = parseNumericField(body.priority, getBannerPrioritySafe(existingBanner))
    }

    if (body.enabled !== undefined) {
      nextBanner.enabled = parseBooleanField(body.enabled, true)
    }

    if (body.alt_text !== undefined) {
      nextBanner.alt_text = typeof body.alt_text === "string" ? body.alt_text : ""
    }

    if (body.open_in_new_tab !== undefined) {
      nextBanner.open_in_new_tab = parseBooleanField(body.open_in_new_tab, false)
    }

    const metadata = upsertBannerInMetadata(existingMeta, nextBanner)
    await updateCategoryMetadata(req, categoryId, metadata)

    const updated = await retrieveCategoryById(req, categoryId)
    return res.json({
      banner: serializeMegaMenuBanner(nextBanner, category.name || ""),
      category: serializeCategoryWithBanners(updated!),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update mega menu banner"
    console.error("PATCH /admin/mega-menu-banners/:categoryId/banners/:bannerId failed:", error)
    return res.status(500).json({ message })
  }
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { categoryId, bannerId } = req.params as { categoryId: string; bannerId: string }
    if (!categoryId || !bannerId) {
      return res.status(400).json({ message: "Category id and banner id are required" })
    }

    const category = await retrieveCategoryById(req, categoryId)
    if (!category) {
      return res.status(404).json({ message: "Category not found" })
    }

    const existingMeta = (category.metadata || {}) as CategoryMegaMenuBannerMetadata
    const { metadata, removed } = removeBannerFromMetadata(existingMeta, bannerId)
    if (!removed) {
      return res.status(404).json({ message: "Banner not found" })
    }

    if (removed.s3_key) {
      try {
        await s3Service.deleteCategoryMegaMenuBanner(removed.s3_key)
      } catch (deleteErr) {
        console.warn("Failed to delete mega menu banner from S3:", deleteErr)
      }
    }

    await updateCategoryMetadata(req, categoryId, metadata)

    const updated = await retrieveCategoryById(req, categoryId)
    return res.json({ category: serializeCategoryWithBanners(updated!) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete mega menu banner"
    console.error("DELETE /admin/mega-menu-banners/:categoryId/banners/:bannerId failed:", error)
    return res.status(500).json({ message })
  }
}

function getBannerPrioritySafe(banner: MegaMenuBanner): number {
  const parsed = typeof banner.priority === "number" ? banner.priority : Number(banner.priority)
  return Number.isFinite(parsed) ? parsed : 9999
}

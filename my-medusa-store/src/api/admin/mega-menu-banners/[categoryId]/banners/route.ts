import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import multer from "multer"
import s3Service from "../../../../../services/s3-service"
import {
  createBannerRecord,
  parseBooleanField,
  parseNumericField,
  parseRedirectTarget,
  resolveRedirectSelection,
  serializeCategoryWithBanners,
  upsertBannerInMetadata,
  type CategoryMegaMenuBannerMetadata,
} from "../../../../../lib/mega-menu-banners"
import {
  listSubcategoriesByParentId,
  retrieveCategoryById,
  updateCategoryMetadata,
} from "../../../../../lib/mega-menu-banner-category"

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"]
    const byExt = /\.(png|jpe?g|webp|svg)$/i.test(file.originalname || "")
    if (allowed.includes(file.mimetype) || byExt) cb(null, true)
    else cb(new Error("Invalid file type. Only PNG, JPG, WebP, and SVG are allowed."))
  },
})

async function runMulterSingle(req: MedusaRequest, res: MedusaResponse) {
  await new Promise<void>((resolve, reject) => {
    upload.single("file")(req as any, res as any, (err: unknown) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { categoryId } = req.params as { categoryId: string }
    if (!categoryId) {
      return res.status(400).json({ message: "Category id is required" })
    }

    await runMulterSingle(req, res)

    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    const body = (req.body || {}) as Record<string, unknown>
    const redirectTarget = parseRedirectTarget(body.redirect_target)
    if (!redirectTarget) {
      return res.status(400).json({ message: "redirect_target is required (parent or subcategory)" })
    }

    const category = await retrieveCategoryById(req, categoryId)
    if (!category) {
      return res.status(404).json({ message: "Category not found" })
    }

    const parentHandle = category.handle || ""
    if (!parentHandle) {
      return res.status(400).json({ message: "Category handle is required to build redirect URL" })
    }

    const subcategories = await listSubcategoriesByParentId(req, categoryId)
    let redirectSelection
    try {
      redirectSelection = resolveRedirectSelection({
        parentHandle,
        parentName: category.name || parentHandle,
        redirectTarget,
        subcategoryHandle:
          typeof body.subcategory_handle === "string" ? body.subcategory_handle : "",
        subcategories,
      })
    } catch (redirectError: unknown) {
      const message =
        redirectError instanceof Error ? redirectError.message : "Invalid redirect selection"
      return res.status(400).json({ message })
    }

    const categoryFolder = category.handle || category.name || categoryId
    const bannerId = crypto.randomUUID()
    const { url, key } = await s3Service.uploadCategoryMegaMenuBanner(
      categoryFolder,
      bannerId,
      file.buffer,
      file.originalname,
      file.mimetype
    )

    const banner = createBannerRecord({
      id: bannerId,
      image_url: url,
      s3_key: key,
      link_url: redirectSelection.link_url,
      redirect_target: redirectSelection.redirect_target,
      subcategory_handle: redirectSelection.subcategory_handle,
      subcategory_name: redirectSelection.subcategory_name,
      priority: parseNumericField(body.priority, 9999),
      enabled: parseBooleanField(body.enabled, true),
      alt_text: typeof body.alt_text === "string" ? body.alt_text : "",
      open_in_new_tab: parseBooleanField(body.open_in_new_tab, false),
    })

    const existing = (category.metadata || {}) as CategoryMegaMenuBannerMetadata
    const metadata = upsertBannerInMetadata(existing, banner)
    await updateCategoryMetadata(req, categoryId, metadata)

    const updated = await retrieveCategoryById(req, categoryId)
    return res.status(201).json({ category: serializeCategoryWithBanners(updated!) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create mega menu banner"
    console.error("POST /admin/mega-menu-banners/:categoryId/banners failed:", error)
    return res.status(500).json({ message })
  }
}

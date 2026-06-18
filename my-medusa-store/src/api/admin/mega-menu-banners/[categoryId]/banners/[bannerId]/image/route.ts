import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import multer from "multer"
import s3Service from "../../../../../../../services/s3-service"
import {
  findBannerInMetadata,
  serializeCategoryWithBanners,
  serializeMegaMenuBanner,
  upsertBannerInMetadata,
  type CategoryMegaMenuBannerMetadata,
} from "../../../../../../../lib/mega-menu-banners"
import {
  retrieveCategoryById,
  updateCategoryMetadata,
} from "../../../../../../../lib/mega-menu-banner-category"

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
    const { categoryId, bannerId } = req.params as { categoryId: string; bannerId: string }
    if (!categoryId || !bannerId) {
      return res.status(400).json({ message: "Category id and banner id are required" })
    }

    await runMulterSingle(req, res)

    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) {
      return res.status(400).json({ message: "No file uploaded" })
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

    const categoryFolder = category.handle || category.name || categoryId
    const previousKey = existingBanner.s3_key
    const { url, key } = await s3Service.uploadCategoryMegaMenuBanner(
      categoryFolder,
      bannerId,
      file.buffer,
      file.originalname,
      file.mimetype
    )

    if (previousKey && previousKey !== key) {
      try {
        await s3Service.deleteCategoryMegaMenuBanner(previousKey)
      } catch (deleteErr) {
        console.warn("Failed to delete previous mega menu banner:", deleteErr)
      }
    }

    const nextBanner = {
      ...existingBanner,
      image_url: url,
      s3_key: key,
      updated_at: new Date().toISOString(),
    }

    const metadata = upsertBannerInMetadata(existingMeta, nextBanner)
    await updateCategoryMetadata(req, categoryId, metadata)

    const updated = await retrieveCategoryById(req, categoryId)
    return res.json({
      banner: serializeMegaMenuBanner(nextBanner),
      category: serializeCategoryWithBanners(updated!),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to reupload mega menu banner"
    console.error("POST /admin/mega-menu-banners/:categoryId/banners/:bannerId/image failed:", error)
    return res.status(500).json({ message })
  }
}

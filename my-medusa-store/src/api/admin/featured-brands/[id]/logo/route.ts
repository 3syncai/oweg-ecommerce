import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import multer from "multer"
import s3Service from "../../../../../services/s3-service"
import {
  logoMetadataClearPatch,
  mergeCollectionMetadata,
  serializeFeaturedBrand,
  type FeaturedBrandMetadata,
} from "../../../../../lib/featured-brands"
import {
  retrieveCollectionById,
  updateCollectionMetadata,
} from "../../route"

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
    const { id } = req.params as { id: string }
    if (!id) {
      return res.status(400).json({ message: "Collection id is required" })
    }

    await runMulterSingle(req, res)

    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    const collection = await retrieveCollectionById(req, id)
    if (!collection) {
      return res.status(404).json({ message: "Collection not found" })
    }

    const brandName = collection.title || collection.handle || id
    const existing = (collection.metadata || {}) as FeaturedBrandMetadata
    const previousKey =
      typeof existing.brand_logo_s3_key === "string" ? existing.brand_logo_s3_key : ""

    const { url, key } = await s3Service.uploadBrandLogo(
      brandName,
      file.buffer,
      file.originalname,
      file.mimetype
    )

    if (previousKey && previousKey !== key) {
      try {
        await s3Service.deleteBrandLogo(previousKey)
      } catch (deleteErr) {
        console.warn("Failed to delete previous brand logo:", deleteErr)
      }
    }

    const metadata = mergeCollectionMetadata(existing, {
      brand_logo_url: url,
      brand_logo_s3_key: key,
    })
    await updateCollectionMetadata(req, id, metadata)

    const updated = await retrieveCollectionById(req, id)
    return res.json({ collection: serializeFeaturedBrand(updated!) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to upload brand logo"
    console.error("POST /admin/featured-brands/:id/logo failed:", error)
    return res.status(500).json({ message })
  }
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const { id } = req.params as { id: string }
    if (!id) {
      return res.status(400).json({ message: "Collection id is required" })
    }

    const collection = await retrieveCollectionById(req, id)
    if (!collection) {
      return res.status(404).json({ message: "Collection not found" })
    }

    const existing = (collection.metadata || {}) as FeaturedBrandMetadata
    const key =
      typeof existing.brand_logo_s3_key === "string" ? existing.brand_logo_s3_key : ""

    if (key) {
      try {
        await s3Service.deleteBrandLogo(key)
      } catch (deleteErr) {
        console.warn("Failed to delete brand logo from S3:", deleteErr)
      }
    }

    const metadata = mergeCollectionMetadata(existing, logoMetadataClearPatch())
    await updateCollectionMetadata(req, id, metadata)

    const updated = await retrieveCollectionById(req, id)
    return res.json({ collection: serializeFeaturedBrand(updated!) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete brand logo"
    console.error("DELETE /admin/featured-brands/:id/logo failed:", error)
    return res.status(500).json({ message })
  }
}

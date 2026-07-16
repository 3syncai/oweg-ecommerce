import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { randomUUID } from "node:crypto"
import * as path from "path"
import * as fs from "fs"
import { requireApprovedVendor } from "../../_lib/guards"
import {
  OwegScrapeError,
  scrapeOwegProduct,
  preferLargerImageUrl,
  catalogOriginalImageUrl,
  type ScrapedOwegProduct,
} from "../../../../lib/oweg-product-scraper"

function setCorsHeaders(res: MedusaResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-publishable-api-key"
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

function readFromEnvFile(key: string): string | undefined {
  try {
    const envPath = path.join(process.cwd(), ".env")
    if (!fs.existsSync(envPath)) return undefined
    const envContent = fs.readFileSync(envPath, "utf-8")
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
      const [envKey, ...valueParts] = trimmed.split("=")
      if (envKey.trim() !== key) continue
      return valueParts
        .join("=")
        .trim()
        .replace(/^["']|["']$/g, "")
    }
  } catch (error) {
    console.error(`Error reading .env file for ${key}:`, error)
  }
  return undefined
}

function getS3Config() {
  let s3Region = process.env.S3_REGION?.trim()
  let s3AccessKeyId = process.env.S3_ACCESS_KEY_ID?.trim()
  let s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim()
  let s3Bucket = process.env.S3_BUCKET?.trim()

  if (s3AccessKeyId && (s3AccessKeyId.includes("REPLACE_ME") || s3AccessKeyId.includes("<"))) {
    const envFileKey = readFromEnvFile("S3_ACCESS_KEY_ID")
    if (envFileKey && !envFileKey.includes("REPLACE_ME") && !envFileKey.includes("<")) {
      s3AccessKeyId = envFileKey
    }
  }

  if (!s3Region) s3Region = readFromEnvFile("S3_REGION")
  if (!s3SecretAccessKey) s3SecretAccessKey = readFromEnvFile("S3_SECRET_ACCESS_KEY")
  if (!s3Bucket) s3Bucket = readFromEnvFile("S3_BUCKET")

  if (
    s3SecretAccessKey &&
    (s3SecretAccessKey.includes("REPLACE_ME") || s3SecretAccessKey.includes("<"))
  ) {
    const envFileSecret = readFromEnvFile("S3_SECRET_ACCESS_KEY")
    if (envFileSecret && !envFileSecret.includes("REPLACE_ME") && !envFileSecret.includes("<")) {
      s3SecretAccessKey = envFileSecret
    }
  }

  return { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket }
}

function sanitizeForPath(str: string): string {
  return (
    str
      .toLowerCase()
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50) || "product"
  )
}

function extensionFromUrlOrType(imageUrl: string, contentType: string | null): string {
  try {
    const pathname = new URL(imageUrl).pathname
    const ext = path.extname(pathname).toLowerCase()
    if (ext && ext.length <= 5) return ext
  } catch {
    // ignore
  }
  if (contentType?.includes("png")) return ".png"
  if (contentType?.includes("webp")) return ".webp"
  if (contentType?.includes("gif")) return ".gif"
  if (contentType?.includes("avif")) return ".avif"
  return ".jpg"
}

type UploadedImage = {
  url: string
  key: string
  filename: string
  originalName: string
}

async function downloadAndUploadImage(params: {
  imageUrl: string
  productName: string
  s3Client: S3Client
  s3Bucket: string
  s3FileUrl: string
}): Promise<UploadedImage> {
  const { imageUrl, productName, s3Client, s3Bucket, s3FileUrl } = params
  const candidates = Array.from(
    new Set([
      catalogOriginalImageUrl(imageUrl),
      imageUrl.trim(),
      preferLargerImageUrl(imageUrl),
    ])
  )

  let lastError: Error | null = null
  for (const candidate of candidates) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const response = await fetch(candidate, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://www.oweg.in/",
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const contentType = response.headers.get("content-type")
      if (contentType && !contentType.startsWith("image/")) {
        throw new Error(`Not an image (${contentType})`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      if (!buffer.length) {
        throw new Error("Empty image body")
      }

      const extension = extensionFromUrlOrType(candidate, contentType)
      const uniqueId = randomUUID().substring(0, 8)
      const filename = `${uniqueId}${extension}`
      const s3Key = `product/${sanitizeForPath(productName)}/img/${filename}`

      await s3Client.send(
        new PutObjectCommand({
          Bucket: s3Bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: contentType || "image/jpeg",
        })
      )

      return {
        url: `${s3FileUrl}/${s3Key}`,
        key: s3Key,
        filename,
        originalName: path.basename(new URL(candidate).pathname) || filename,
      }
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error))
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError || new Error("Failed to download image")
}

function toDraft(
  scraped: ScrapedOwegProduct,
  uploadedImages: UploadedImage[],
  colorImages: Record<string, UploadedImage[]>
) {
  const productOptions = scraped.productOptions.map((opt) => ({
    title: opt.title,
    values: opt.values,
    valuesInput: opt.values.join(", "),
  }))

  const firstColorImage = Object.values(colorImages).flat()[0]

  return {
    title: scraped.title,
    handle: scraped.handle,
    description: scraped.description,
    brand: scraped.brand,
    hasVariants: scraped.hasVariants,
    productOptions,
    variants: scraped.variants,
    uploadedImages,
    colorImages,
    thumbnailUrl: firstColorImage?.url || uploadedImages[0]?.url || null,
    sku: scraped.sku,
    price: scraped.price,
    discounted_price: scraped.discountedPrice,
    metadata: {
      source_url: scraped.sourceUrl,
      source: "oweg.in_scrape",
      brand: scraped.brand || undefined,
    },
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const body = ((req as any).body || {}) as { url?: string }
    const url = typeof body.url === "string" ? body.url.trim() : ""
    if (!url) {
      return res.status(400).json({ message: "url is required" })
    }

    const scraped = await scrapeOwegProduct(url)
    const warnings = [...scraped.warnings]

    const { s3Region, s3AccessKeyId, s3SecretAccessKey, s3Bucket } = getS3Config()
    if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey || !s3Region) {
      return res.status(500).json({
        message: "S3 configuration missing. Please check your .env file.",
      })
    }

    const s3Client = new S3Client({
      region: s3Region,
      credentials: {
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
      },
    })
    const s3FileUrl =
      process.env.S3_FILE_URL || `https://${s3Bucket}.s3.${s3Region}.amazonaws.com`

    const productName = scraped.title || scraped.handle || "product"
    const uploadedBySource = new Map<string, UploadedImage>()

    const uploadOne = async (imageUrl: string): Promise<UploadedImage | null> => {
      const key = imageUrl.trim()
      const cached = uploadedBySource.get(key)
      if (cached) return cached
      try {
        const uploaded = await downloadAndUploadImage({
          imageUrl: key,
          productName,
          s3Client,
          s3Bucket,
          s3FileUrl,
        })
        uploadedBySource.set(key, uploaded)
        return uploaded
      } catch (error: any) {
        console.error("Migrate image upload failed:", imageUrl, error?.message || error)
        warnings.push(`Failed to upload image: ${imageUrl}`)
        return null
      }
    }

    // Upload images in parallel (bounded) — sequential uploads were the main slowdown.
    const uploadMany = async (urls: string[]): Promise<UploadedImage[]> => {
      const unique = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)))
      const concurrency = 4
      const results: UploadedImage[] = []
      for (let i = 0; i < unique.length; i += concurrency) {
        const chunk = unique.slice(i, i + concurrency)
        const uploaded = await Promise.all(chunk.map((url) => uploadOne(url)))
        for (const item of uploaded) {
          if (item) results.push(item)
        }
      }
      return results
    }

    const colorImages: Record<string, UploadedImage[]> = {}
    const colorEntries = Object.entries(scraped.colorImageUrls || {})
    if (colorEntries.length) {
      const flatUrls = colorEntries.flatMap(([, urls]) => urls)
      await uploadMany(flatUrls)
      for (const [colorValue, urls] of colorEntries) {
        const uploadedForColor: UploadedImage[] = []
        for (const imageUrl of urls) {
          const cached = uploadedBySource.get(imageUrl.trim())
          if (cached) uploadedForColor.push(cached)
        }
        if (uploadedForColor.length) {
          colorImages[colorValue] = uploadedForColor
        }
      }
    }

    let uploadedImages: UploadedImage[] = []
    const shouldUploadGallery = !scraped.hasVariants || Object.keys(colorImages).length === 0
    if (shouldUploadGallery) {
      // Cap gallery size so migrate stays fast
      uploadedImages = await uploadMany(scraped.imageUrls.slice(0, 8))
    }

    if (!uploadedImages.length && !Object.keys(colorImages).length && scraped.imageUrls.length) {
      warnings.push("All image uploads failed; product data was still extracted")
    }

    return res.json({
      draft: toDraft(scraped, uploadedImages, colorImages),
      warnings,
    })
  } catch (error: any) {
    if (error instanceof OwegScrapeError) {
      return res.status(error.status).json({ message: error.message })
    }
    console.error("migrate-from-url error:", error)
    return res.status(500).json({
      message: error?.message || "Failed to migrate product from URL",
    })
  }
}

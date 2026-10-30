import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { createHash } from "node:crypto"
import { requireApprovedVendor } from "../../_lib/guards"
import { resolveRemoteProductImage, RemoteImageInputError } from "../../../../lib/remote-product-image"
import { s3PublicBaseUrl } from "../../../../lib/s3-access"

let active = 0
export async function POST(req: MedusaRequest<{ url?: unknown }>, res: MedusaResponse) {
  const vendor = await requireApprovedVendor(req, res)
  if (!vendor) return
  if (typeof req.body?.url !== "string") return res.status(400).json({ message: "An image URL is required" })
  if (active >= 8) return res.status(429).json({ message: "Image checks are busy. Retry shortly." })
  active++
  try {
    const file = await resolveRemoteProductImage(req.body.url, async image => {
      const region = process.env.S3_REGION?.trim(), bucket = process.env.S3_BUCKET?.trim()
      const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim(), secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim()
      if (!region || !bucket || !accessKeyId || !secretAccessKey) throw new Error("Image storage is not configured")
      const base = s3PublicBaseUrl(bucket, region)
      if (!base.startsWith("https://")) throw new Error("Image storage must use HTTPS")
      // Retrying the same image reuses its object instead of creating duplicates.
      const digest = createHash("sha256").update(image.bytes).digest("hex")
      const key = `product/vendor-${vendor.vendor_id}/bulk-images/${digest}.${image.extension}`
      const client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } })
      try {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: image.bytes, ContentType: image.mime }), { abortSignal: AbortSignal.timeout(15000) })
      } finally { client.destroy() }
      return { key, url: `${base}/${key}` }
    })
    return res.status(200).json(file)
  } catch (error) {
    return res.status(error instanceof RemoteImageInputError ? 400 : 422).json({ message: error instanceof Error ? error.message : "Image import failed" })
  } finally { active-- }
}

import { randomUUID } from "node:crypto"
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { GetObjectCommand } from "@aws-sdk/client-s3"

export const RETURN_IMAGE_MAX_BYTES = 3 * 1024 * 1024
export const RETURN_IMAGE_MAX_COUNT = 5
export type ReturnImage = { key: string; order_item_id: string }
const segment = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value)

function storage() {
  const region = process.env.S3_REGION
  const bucket = process.env.RETURN_IMAGES_S3_BUCKET || process.env.S3_BUCKET || process.env.AWS_S3_BUCKET
  if (!region || !bucket) throw new Error("Return image storage is not configured")
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!!accessKeyId !== !!secretAccessKey) throw new Error("Incomplete return image storage credentials")
  return { bucket, client: new S3Client({ region,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  }) }
}

export function returnImagePrefix(customer: string, order: string, item: string) {
  if (![customer, order, item].every(segment)) throw new Error("Invalid return image owner")
  return `returns/${customer}/${order}/${item}/`
}

export function imageType(buffer: Buffer): { type: string; extension: string } {
  if (!buffer.length || buffer.length > RETURN_IMAGE_MAX_BYTES) throw new Error("Each photo must be 3 MB or smaller.")
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { type: "image/png", extension: "png" }
  if (buffer.length > 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { type: "image/jpeg", extension: "jpg" }
  if (buffer.length >= 12 && buffer.toString("ascii",0,4) === "RIFF" && buffer.toString("ascii",8,12) === "WEBP") return { type: "image/webp", extension: "webp" }
  throw new Error("Upload a JPG, PNG or WebP photo.")
}

export function validateReturnImages(images: ReturnImage[], customer: string, order: string, items: string[]) {
  if (images.length > RETURN_IMAGE_MAX_COUNT || new Set(images.map((image) => image.key)).size !== images.length)
    throw new Error("Attach up to 5 different photos.")
  for (const image of images) {
    if (!items.includes(image.order_item_id)) throw new Error("Photos must belong to a selected return item.")
    const prefix = returnImagePrefix(customer, order, image.order_item_id)
    if (!image.key.startsWith(prefix) || !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(image.key.slice(prefix.length)))
      throw new Error("Invalid return photo reference.")
  }
}

export async function uploadReturnImage(customer: string, order: string, item: string, buffer: Buffer) {
  const format = imageType(buffer)
  const key = `${returnImagePrefix(customer, order, item)}${randomUUID()}.${format.extension}`
  const { bucket, client } = storage()
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer,
      ContentType: format.type, ServerSideEncryption: "AES256",
      Metadata: { customer_id: customer, order_id: order, order_item_id: item },
    }))
    return { key, order_item_id: item }
  } finally { client.destroy() }
}

export async function verifyStoredReturnImages(images: ReturnImage[], customer: string, order: string) {
  if (!images.length) return
  const { bucket, client } = storage()
  try {
    for (const image of images) {
      const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: image.key }))
      if (object.Metadata?.customer_id !== customer || object.Metadata?.order_id !== order ||
          object.Metadata?.order_item_id !== image.order_item_id || !object.ContentLength ||
          object.ContentLength > RETURN_IMAGE_MAX_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(object.ContentType || ""))
        throw new Error("Return photo could not be verified. Please upload it again.")
    }
  } finally { client.destroy() }
}

export function storedReturnImages(request: any, allowedItems?: Set<string>): ReturnImage[] {
  const images = request.metadata?.return_images
  if (!Array.isArray(images)) return []
  return images.filter((image): image is ReturnImage => {
    if (!image || typeof image.key !== "string" || typeof image.order_item_id !== "string" ||
        (allowedItems && !allowedItems.has(image.order_item_id))) return false
    try { validateReturnImages([image], request.customer_id, request.order_id, [image.order_item_id]); return true }
    catch { return false }
  }).slice(0, RETURN_IMAGE_MAX_COUNT)
}

export async function returnImageViews(request: any, allowedItems?: Set<string>) {
  const images = storedReturnImages(request, allowedItems)
  if (!images.length) return []
  try {
    const { bucket, client } = storage()
    try {
      return await Promise.all(images.map(async (image) => ({ ...image,
        url: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: image.key }), { expiresIn: 3600 }),
      })))
    } finally { client.destroy() }
  } catch { return images.map((image) => ({ ...image, url: "" })) }
}

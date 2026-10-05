import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

type S3Env = {
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

function readS3Env(): S3Env | null {
  const region = process.env.S3_REGION?.trim() || ""
  const bucket = (process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || "").trim()
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || ""
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || ""
  if (!region || !bucket || !accessKeyId || !secretAccessKey) return null
  return { region, bucket, accessKeyId, secretAccessKey }
}

let cachedClient: S3Client | null = null
let cachedClientKey = ""

function getS3Client(): { client: S3Client; bucket: string; region: string } | null {
  const env = readS3Env()
  if (!env) return null
  const key = `${env.region}:${env.bucket}:${env.accessKeyId}`
  if (!cachedClient || cachedClientKey !== key) {
    cachedClient = new S3Client({
      region: env.region,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    })
    cachedClientKey = key
  }
  return { client: cachedClient, bucket: env.bucket, region: env.region }
}

/** Public URL host must match the upload bucket — stale S3_FILE_URL is ignored. */
export function s3PublicBaseUrl(): string {
  const env = readS3Env()
  const configured = (process.env.S3_FILE_URL || "").replace(/\/$/, "").trim()
  if (env && configured && configured.includes(env.bucket)) return configured
  if (env) return `https://${env.bucket}.s3.${env.region}.amazonaws.com`
  return configured
}

export function s3PublicObjectUrl(key: string): string {
  const clean = String(key || "").replace(/^\//, "")
  return `${s3PublicBaseUrl()}/${clean}`
}

export function extractS3Key(urlOrKey?: string | null): string {
  const raw = String(urlOrKey || "").trim()
  if (!raw) return ""
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\//, "")
  try {
    const parsed = new URL(raw)
    return parsed.pathname.replace(/^\//, "")
  } catch {
    return raw.replace(/^\//, "")
  }
}

export async function signS3Object(
  urlOrKey?: string | null,
  expiresIn = 3600
): Promise<string | null> {
  const key = extractS3Key(urlOrKey)
  const s3 = getS3Client()
  if (!key || !s3) return null
  try {
    return await getSignedUrl(
      s3.client,
      new GetObjectCommand({ Bucket: s3.bucket, Key: key }),
      { expiresIn }
    )
  } catch (error) {
    console.warn("[s3-access] signed URL failed for", key, error)
    return null
  }
}

/**
 * Prefer a signed URL for private buckets. Never fall back to an unsigned
 * public object URL (those 403 on private buckets and look like "broken docs").
 * Returns "" when the object cannot be signed so UIs can show a clear empty state.
 */
export async function resolveS3ViewUrl(params: {
  key?: string | null
  url?: string | null
}): Promise<string> {
  const signed = await signS3Object(params.key || params.url)
  if (signed) return signed

  const raw = String(params.url || "").trim()
  // Already-presigned URLs (X-Amz-*) can be returned as-is.
  if (raw && /[?&]X-Amz-/i.test(raw)) return raw

  if (params.key || raw) {
    console.warn(
      "[s3-access] could not sign private object; refusing unsigned public fallback",
      params.key || extractS3Key(raw)
    )
  }
  return ""
}

import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { s3PublicBaseUrl } from '../s3-access'

export const NOTIFICATION_IMAGE_MAX_BYTES = 2 * 1024 * 1024
export function notificationImageType(buffer: Buffer) {
  if (!buffer.length || buffer.length > NOTIFICATION_IMAGE_MAX_BYTES) throw new Error('Choose an image up to 2 MB.')
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { extension: 'png', type: 'image/png' }
  if (buffer.length > 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { extension: 'jpg', type: 'image/jpeg' }
  if (buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return { extension: 'webp', type: 'image/webp' }
  throw new Error('Choose a PNG, JPEG or WebP image.')
}
export function notificationImageKey(extension: string, date = new Date(), id = randomUUID()) {
  if (!['png','jpg','webp'].includes(extension) || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid notification image reference.')
  const stamp = date.toISOString()
  return `notifications/${stamp.slice(0,10).replace(/-/g,'/')}/${stamp.replace(/[:.]/g,'-')}_${id}.${extension}`
}
export async function uploadNotificationImage(buffer: Buffer) {
  const format = notificationImageType(buffer)
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET
  const region = process.env.S3_REGION || 'ap-south-1'
  if (!bucket) throw new Error('Notification image storage is not configured.')
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) throw new Error('Incomplete storage configuration.')
  const client = new S3Client({ region, ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}), maxAttempts: 2 })
  const key = notificationImageKey(format.extension)
  const uploadedAt = new Date().toISOString()
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: format.type,
      ServerSideEncryption: 'AES256', CacheControl: 'public, max-age=86400',
      Metadata: { purpose: 'notification-campaign', uploaded_at: uploadedAt },
    }), { abortSignal: AbortSignal.timeout(15000) })
    return { key, url: `${s3PublicBaseUrl(bucket,region)}/${key}`, uploaded_at: uploadedAt }
  } finally { client.destroy() }
}

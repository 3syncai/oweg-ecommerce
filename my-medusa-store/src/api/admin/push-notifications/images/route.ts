import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import multer from 'multer'
import { NOTIFICATION_IMAGE_MAX_BYTES, notificationImageType, uploadNotificationImage } from '../../../../lib/web-push/images'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: NOTIFICATION_IMAGE_MAX_BYTES, files: 1, fields: 0 } }).single('file')
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    await new Promise<void>((resolve,reject) => upload(req as never,res as never,error => error ? reject(error) : resolve()))
  } catch { return res.status(400).json({ error: 'Upload one PNG, JPEG or WebP image up to 2 MB.' }) }
  const file = (req as MedusaRequest & { file?: Express.Multer.File }).file
  if (!file) return res.status(400).json({ error: 'Choose an image first.' })
  try { notificationImageType(file.buffer) }
  catch { return res.status(400).json({ error: 'Upload one valid PNG, JPEG or WebP image up to 2 MB.' }) }
  try { return res.json({ image: await uploadNotificationImage(file.buffer) }) }
  catch { return res.status(503).json({ error: 'Notification image upload failed. Check storage configuration and retry. Existing campaign images are unchanged.' }) }
}

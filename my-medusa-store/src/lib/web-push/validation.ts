import { z } from 'zod'

export function safeDestination(value: string): boolean {
  try {
    const decoded = decodeURIComponent(value)
    return decoded.startsWith('/') && !decoded.startsWith('//') && !/[\\\u0000-\u0020]/.test(decoded) &&
      new URL(value, 'https://www.0weg.in').origin === 'https://www.0weg.in'
  } catch { return false }
}
export function safeEndpoint(value: string): boolean {
  try {
    const u = new URL(value)
    const h = u.hostname.toLowerCase()
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash && (!u.port || u.port === '443') &&
      (h === 'fcm.googleapis.com' || h === 'web.push.apple.com' || h.endsWith('.push.services.mozilla.com') || h.endsWith('.notify.windows.com'))
  } catch { return false }
}
export function safeImage(value: string): boolean {
  if (!value || safeDestination(value)) return true
  try {
    const url = new URL(value)
    const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET
    const storageOrigin = bucket ? `https://${bucket}.s3.${process.env.S3_REGION || 'ap-south-1'}.amazonaws.com` : ''
    const origins = [storageOrigin, 'https://www.0weg.in', 'https://0weg.in', ...(process.env.WEB_PUSH_IMAGE_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)]
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search && origins.includes(url.origin)
  } catch { return false }
}
const key = (bytes: number) => z.string().regex(/^[A-Za-z0-9_-]+$/).refine(s => Buffer.from(s, 'base64url').length === bytes)
export const subscriptionSchema = z.object({
  expected_customer_id: z.string().regex(/^cus_[A-Za-z0-9]+$/).optional(),
  endpoint: z.string().max(2048).refine(safeEndpoint, 'Unsupported push provider'),
  keys: z.object({ p256dh: key(65), auth: key(16) }).strict(),
}).strict()
export const campaignSchema = z.object({
  title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(240),
  url: z.string().max(500).refine(safeDestination, 'Use a storefront path starting with /'),
  image: z.string().max(1000).refine(safeImage, 'Use a storefront path or a configured public image origin').default(''),
  audience_mode: z.enum(['all', 'selected']).optional(),
  audience: z.array(z.string().regex(/^cus_[A-Za-z0-9]+$/)).default([]),
  expires_at: z.string().datetime().refine(s => Date.parse(s) > Date.now(), 'Expiry must be in the future'),
}).strict().superRefine((value, context) => {
  if (value.audience_mode === 'selected' && !value.audience.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['audience'], message: 'Select at least one customer for a targeted campaign.' })
  if (value.audience_mode === 'all' && value.audience.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['audience'], message: 'All-customer mode cannot contain a selected audience.' })
})
export function retryDelay(attempt: number) { return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1)) }

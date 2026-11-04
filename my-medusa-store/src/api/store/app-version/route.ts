import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'

/** Public policy for Capacitor force-update. No auth; no secrets. */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'public, max-age=60')
  return res.json({
    ios: {
      min_version: process.env.OWEG_IOS_MIN_VERSION || '0.0.0',
      store_url: process.env.OWEG_IOS_STORE_URL || '',
    },
    android: {
      min_version: process.env.OWEG_ANDROID_MIN_VERSION || '0.0.0',
      store_url: process.env.OWEG_ANDROID_STORE_URL || '',
    },
    message:
      process.env.OWEG_FORCE_UPDATE_MESSAGE ||
      'A required update is available. Please update OWEG to continue shopping.',
  })
}

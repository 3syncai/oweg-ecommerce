import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { randomUUID } from 'node:crypto'
import { getSharedDbPool } from '../../../lib/db-pool'
import { fcmConfigured } from '../../../lib/web-push/fcm'
import { pushConfigured } from '../../../lib/web-push/service'
import { fcmEndpoint, nativeSubscriptionSchema, subscriptionSchema } from '../../../lib/web-push/validation'

const actor = (req: MedusaRequest) => (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (!actor(req)) return res.status(401).json({ error: 'Please sign in.' })
  const provider = typeof req.query.provider === 'string' ? req.query.provider : ''
  const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint.slice(0, 2048) : ''
  let active = false
  if (provider === 'fcm') {
    const state = await getSharedDbPool().query(
      `SELECT 1 FROM oweg_push_subscription WHERE customer_id=$1 AND provider='fcm' AND active AND installed_app LIMIT 1`,
      [actor(req)]
    )
    active = Boolean(state.rowCount)
  } else if (endpoint) {
    const state = await getSharedDbPool().query(
      'SELECT 1 FROM oweg_push_subscription WHERE customer_id=$1 AND endpoint=$2 AND active AND installed_app',
      [actor(req), endpoint]
    )
    active = Boolean(state.rowCount)
  }
  return res.json({
    customer_id: actor(req),
    configured: pushConfigured(),
    native_configured: fcmConfigured(),
    publicKey: pushConfigured() ? process.env.WEB_PUSH_PUBLIC_KEY : null,
    active,
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customer = actor(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in.' })
  const body = req.body as Record<string, unknown>
  const account = await getSharedDbPool().query('SELECT 1 FROM customer WHERE id=$1 AND deleted_at IS NULL', [customer])
  if (!account.rowCount) return res.status(401).json({ error: 'Please sign in to an active customer account.' })

  if (body?.provider === 'fcm') {
    if (!fcmConfigured()) return res.status(503).json({ error: 'App notifications are not available yet.' })
    const parsed = nativeSubscriptionSchema.safeParse(body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid device subscription.' })
    if (parsed.data.expected_customer_id && parsed.data.expected_customer_id !== customer) {
      return res.status(409).json({ error: 'Account changed. Please retry notification setup.' })
    }
    const endpoint = fcmEndpoint(parsed.data.token)
    const saved = await getSharedDbPool().query(
      `INSERT INTO oweg_push_subscription(id,customer_id,endpoint,p256dh,auth,provider,platform,installed_app)
       VALUES($1,$2,$3,NULL,NULL,'fcm',$4,true)
       ON CONFLICT(endpoint) DO UPDATE SET active=true,provider='fcm',platform=EXCLUDED.platform,installed_app=true,updated_at=now()
       WHERE oweg_push_subscription.customer_id=EXCLUDED.customer_id RETURNING id`,
      [randomUUID(), customer, endpoint, parsed.data.platform]
    )
    if (!saved.rowCount) {
      return res.status(409).json({ error: 'This device was linked to another account. Disable notifications, then enable again.' })
    }
    return res.json({ active: true, provider: 'fcm' })
  }

  if (!pushConfigured()) return res.status(503).json({ error: 'Browser notifications are not available yet.' })
  const parsed = subscriptionSchema.safeParse(body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid browser subscription.' })
  if (parsed.data.expected_customer_id && parsed.data.expected_customer_id !== customer) {
    return res.status(409).json({ error: 'Account changed. Please retry notification setup.' })
  }
  const s = parsed.data
  const saved = await getSharedDbPool().query(
    `INSERT INTO oweg_push_subscription(id,customer_id,endpoint,p256dh,auth,provider,platform,installed_app)
     VALUES($1,$2,$3,$4,$5,'web_push','web',true)
     ON CONFLICT(endpoint) DO UPDATE SET active=true,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,provider='web_push',platform='web',installed_app=true,updated_at=now()
     WHERE oweg_push_subscription.customer_id=EXCLUDED.customer_id RETURNING id`,
    [randomUUID(), customer, s.endpoint, s.keys.p256dh, s.keys.auth]
  )
  if (!saved.rowCount) {
    return res.status(409).json({ error: 'This browser was linked to another account. Disable browser notifications, then enable again.' })
  }
  return res.json({ active: true, provider: 'web_push' })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const customer = actor(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in.' })
  const endpoint = (req.body as { endpoint?: unknown })?.endpoint
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return res.status(400).json({ error: 'Invalid subscription.' })
  await getSharedDbPool().query(
    `UPDATE oweg_push_subscription SET active=false,updated_at=now() WHERE customer_id=$1 AND endpoint=$2`,
    [customer, endpoint]
  )
  return res.json({ active: false })
}

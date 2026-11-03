import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { randomUUID } from 'node:crypto'
import { getSharedDbPool } from '../../../lib/db-pool'
import { pushConfigured } from '../../../lib/web-push/service'
import { subscriptionSchema } from '../../../lib/web-push/validation'

const actor = (req: MedusaRequest) => (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (!actor(req)) return res.status(401).json({ error: 'Please sign in.' })
  const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint.slice(0, 2048) : ''
  const state = endpoint ? await getSharedDbPool().query('SELECT 1 FROM oweg_push_subscription WHERE customer_id=$1 AND endpoint=$2 AND active', [actor(req), endpoint]) : null
  return res.json({ configured: pushConfigured(), publicKey: pushConfigured() ? process.env.WEB_PUSH_PUBLIC_KEY : null, active: Boolean(state?.rowCount) })
}
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customer = actor(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in.' })
  if (!pushConfigured()) return res.status(503).json({ error: 'Browser notifications are not available yet.' })
  const parsed = subscriptionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid browser subscription.' })
  const account = await getSharedDbPool().query('SELECT 1 FROM customer WHERE id=$1 AND deleted_at IS NULL', [customer])
  if (!account.rowCount) return res.status(401).json({ error: 'Please sign in to an active customer account.' })
  const s = parsed.data
  const saved = await getSharedDbPool().query(`INSERT INTO oweg_push_subscription(id,customer_id,endpoint,p256dh,auth)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(endpoint) DO UPDATE SET active=true,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,updated_at=now()
    WHERE oweg_push_subscription.customer_id=EXCLUDED.customer_id RETURNING id`, [randomUUID(), customer, s.endpoint, s.keys.p256dh, s.keys.auth])
  if (!saved.rowCount) return res.status(409).json({ error: 'This browser was linked to another account. Disable browser notifications, then enable again.' })
  return res.json({ active: true })
}
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const customer = actor(req)
  if (!customer) return res.status(401).json({ error: 'Please sign in.' })
  const endpoint = (req.body as { endpoint?: unknown })?.endpoint
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return res.status(400).json({ error: 'Invalid subscription.' })
  await getSharedDbPool().query(`UPDATE oweg_push_subscription SET active=false,updated_at=now() WHERE customer_id=$1 AND endpoint=$2`, [customer, endpoint])
  return res.json({ active: false })
}

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { getSharedDbPool } from '../../../lib/db-pool'
import { safeDestination, safeImage } from '../../../lib/web-push/validation'

// Reuse delivery receipts. Never expose another customer's audience or device data.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  const customer = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id
  if (!customer) return res.status(401).json({ error: 'Please sign in.' })
  const offset = Number(req.query.offset ?? 0)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return res.status(400).json({ error: 'Invalid page.' })
  const result = await getSharedDbPool().query(`SELECT c.id,c.title,c.body,c.url,c.image,
    c.snapshot_at AS sent_at,c.expires_at,(c.expires_at<=now()) AS expired
    FROM oweg_push_campaign c
    WHERE c.status IN ('sending','completed') AND EXISTS (
      SELECT 1 FROM oweg_push_delivery d
      JOIN oweg_push_subscription s ON s.id=d.subscription_id
      JOIN customer account ON account.id=s.customer_id AND account.deleted_at IS NULL
      WHERE d.campaign_id=c.id AND s.customer_id=$1 AND d.attempts>0
    ) ORDER BY c.snapshot_at DESC NULLS LAST,c.id DESC LIMIT 21 OFFSET $2`, [customer, offset])
  return res.json({ notifications: result.rows.slice(0,20).map(row => ({
    ...row, url: safeDestination(row.url) ? row.url : '/',
    image: row.image && safeImage(row.image) ? row.image : null,
  })), has_more: result.rows.length > 20 })
}

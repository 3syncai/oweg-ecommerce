import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getSharedDbPool } from '../../../lib/db-pool'
import { pushConfigured } from '../../../lib/web-push/service'
import { campaignSchema } from '../../../lib/web-push/validation'

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  const offset = Math.max(0, Math.min(100000, Number(req.query.offset) || 0))
  const pool = getSharedDbPool()
  const rows = await pool.query(`SELECT c.*,count(*) OVER()::int AS total,
    (SELECT count(*)::int FROM oweg_push_delivery d WHERE d.campaign_id=c.id) AS recipients,
    (SELECT count(*)::int FROM oweg_push_delivery d WHERE d.campaign_id=c.id AND d.status='accepted') AS accepted,
    (SELECT count(*)::int FROM oweg_push_delivery d WHERE d.campaign_id=c.id AND d.clicked_at IS NOT NULL) AS clicked,
    (SELECT count(*)::int FROM oweg_push_delivery d WHERE d.campaign_id=c.id AND d.status='failed') AS failed
    FROM oweg_push_campaign c ORDER BY created_at DESC LIMIT 25 OFFSET $1`, [offset])
  const subscribers = await pool.query('SELECT count(*)::int AS count FROM oweg_push_subscription WHERE active')
  const worker = await pool.query(`SELECT COALESCE(last_success_at>now()-interval '3 minutes' AND
    (last_error_at IS NULL OR last_error_at<=last_success_at),false) AS healthy FROM oweg_push_worker_state WHERE worker_id='web-push'`)
  return res.json({ campaigns: rows.rows, total: rows.rows[0]?.total || 0, subscribers: subscribers.rows[0].count,
    configured: pushConfigured(), enabled: process.env.WEB_PUSH_ENABLED === 'true', workerHealthy: Boolean(worker.rows[0]?.healthy) })
}

const requestSchema = z.object({ action: z.enum(['save','send','schedule','cancel','test']), id: z.string().uuid().optional(),
  revision: z.number().int().positive().optional(), campaign: campaignSchema.optional(),
  scheduled_at: z.string().datetime().optional(), test_customer: z.string().regex(/^cus_[A-Za-z0-9]+$/).optional() }).strict()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = requestSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join('; ') })
  const { action, id, revision, campaign, scheduled_at, test_customer } = parsed.data
  const pool = getSharedDbPool()
  if (action === 'save' || action === 'test') {
    if (!campaign) return res.status(400).json({ error: 'Campaign details required.' })
    if (action === 'test' && (!test_customer || !pushConfigured() || process.env.WEB_PUSH_ENABLED !== 'true')) return res.status(400).json({ error: 'Sending must be enabled and a test customer selected.' })
    if (action === 'test') {
      const count = await pool.query('SELECT 1 FROM oweg_push_subscription WHERE active AND customer_id=$1 LIMIT 1', [test_customer])
      if (!count.rowCount) return res.status(400).json({ error: 'Test customer has not enabled browser notifications.' })
    }
    const values = [campaign.title, campaign.body, campaign.url, campaign.image, JSON.stringify(action === 'test' ? [test_customer] : campaign.audience), campaign.expires_at]
    if (id && action === 'save') {
      const updated = await pool.query(`UPDATE oweg_push_campaign SET title=$1,body=$2,url=$3,image=$4,audience=$5,expires_at=$6,revision=revision+1,updated_at=now()
        WHERE id=$7 AND revision=$8 AND status='draft' RETURNING *`, [...values, id, revision])
      if (!updated.rowCount) return res.status(409).json({ error: 'Draft changed or was already queued. Reload before editing.' })
      return res.json({ campaign: updated.rows[0] })
    }
    const actor = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id || 'service-key'
    const result = await pool.query(`INSERT INTO oweg_push_campaign(title,body,url,image,audience,expires_at,id,created_by,status,scheduled_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [...values, randomUUID(), actor, action === 'test' ? 'scheduled' : 'draft', action === 'test' ? new Date() : null])
    return res.json({ campaign: result.rows[0] })
  }
  if (!id || !revision) return res.status(400).json({ error: 'Campaign ID and revision required.' })
  if (action === 'cancel') {
    const result = await pool.query(`UPDATE oweg_push_campaign SET status='cancelled',revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 AND status IN ('draft','scheduled','sending') RETURNING id`, [id, revision])
    return res.status(result.rowCount ? 200 : 409).json({ ok: Boolean(result.rowCount), error: result.rowCount ? undefined : 'Campaign changed. Reload.' })
  }
  if (!pushConfigured() || process.env.WEB_PUSH_ENABLED !== 'true') return res.status(503).json({ error: 'Push sending is disabled. Configure and enable the worker first.' })
  const date = action === 'schedule' ? new Date(scheduled_at || '') : new Date()
  if (!Number.isFinite(date.getTime()) || (action === 'schedule' && date.getTime() <= Date.now())) return res.status(400).json({ error: 'Choose a future send time.' })
  const result = await pool.query(`UPDATE oweg_push_campaign SET status='scheduled',scheduled_at=$3,revision=revision+1,updated_at=now()
    WHERE id=$1 AND revision=$2 AND status='draft' AND expires_at>$3 RETURNING *`, [id, revision, date])
  if (!result.rowCount) return res.status(409).json({ error: 'Campaign changed, already queued, or expires before sending.' })
  return res.json({ campaign: result.rows[0] })
}

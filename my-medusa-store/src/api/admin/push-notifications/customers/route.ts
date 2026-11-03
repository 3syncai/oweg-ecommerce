import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { getSharedDbPool } from '../../../../lib/db-pool'

/** Marketing-scoped selector: all active customers, with subscription eligibility; never expose subscription secrets. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 254) : ''
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(req.query.limit) || 25)))
  const requestedOffset = Number(req.query.offset)
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0
  // Treat wildcard characters literally; all values remain parameterized.
  const search = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'
  const eligible = req.query.eligible === 'true'
  const filter = `c.deleted_at IS NULL AND (NOT $3::boolean OR EXISTS (SELECT 1 FROM oweg_push_subscription s WHERE s.customer_id=c.id AND s.active))
    AND ($1='' OR c.email ILIKE $2 OR concat_ws(' ',c.first_name,c.last_name) ILIKE $2 OR c.id=$1)`
  const pool = getSharedDbPool()
  const rows = await pool.query(`SELECT c.id,c.email,c.first_name,c.last_name,
    (SELECT count(*)::int FROM oweg_push_subscription s WHERE s.customer_id=c.id AND s.active) AS devices
    FROM customer c WHERE ${filter} ORDER BY c.created_at DESC,c.id ASC LIMIT $4 OFFSET $5`, [q, search, eligible, limit, offset])
  const count = await pool.query(`SELECT count(*)::int AS total FROM customer c WHERE ${filter}`, [q, search, eligible])
  return res.json({ customers: rows.rows, total: count.rows[0].total, limit, offset })
}

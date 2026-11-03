import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { getSharedDbPool } from '../../../../lib/db-pool'

/** Marketing-scoped selector: opted-in customers only; never expose subscription secrets. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(req.query.limit) || 25)))
  const offset = Math.min(100000, Math.max(0, Math.trunc(Number(req.query.offset) || 0)))
  // Treat wildcard characters literally; all values remain parameterized.
  const search = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'
  const filter = `c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM oweg_push_subscription s WHERE s.customer_id=c.id AND s.active)
    AND ($1='' OR c.email ILIKE $2 OR concat_ws(' ',c.first_name,c.last_name) ILIKE $2 OR c.id=$1)`
  const pool = getSharedDbPool()
  const rows = await pool.query(`SELECT c.id,c.email,c.first_name,c.last_name,
    (SELECT count(*)::int FROM oweg_push_subscription s WHERE s.customer_id=c.id AND s.active) AS devices
    FROM customer c WHERE ${filter} ORDER BY c.created_at DESC,c.id ASC LIMIT $3 OFFSET $4`, [q, search, limit, offset])
  const count = await pool.query(`SELECT count(*)::int AS total FROM customer c WHERE ${filter}`, [q, search])
  return res.json({ customers: rows.rows, total: count.rows[0].total, limit, offset })
}

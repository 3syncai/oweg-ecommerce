import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { z } from 'zod'
import { getSharedDbPool } from '../../../lib/db-pool'
// An unguessable receipt capability, not a customer/session identifier.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = z.object({ token: z.string().uuid() }).strict().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid receipt.' })
  await getSharedDbPool().query(`UPDATE oweg_push_delivery SET clicked_at=now() WHERE click_token=$1 AND clicked_at IS NULL AND status IN ('accepted','sending')`, [parsed.data.token])
  res.setHeader('Cache-Control', 'no-store')
  return res.status(204).end()
}

import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireSuperadmin } from "../../../../lib/admin-access/repository"
import { getSharedDbPool } from "../../../../lib/db-pool"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireSuperadmin(req.auth_context.actor_id)
  const { rows } = await getSharedDbPool().query(`
    SELECT a.id, a.action, a.target_id, a.details, a.created_at, u.email AS actor_email
    FROM oweg_admin_audit a LEFT JOIN "user" u ON u.id=a.actor_id
    WHERE a.category='access_change' ORDER BY a.created_at DESC LIMIT 100
  `)
  return res.json({ events: rows })
}

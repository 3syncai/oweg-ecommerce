import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { saveCustomPermission } from "../../../../../lib/admin-access/repository"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const permission = await saveCustomPermission(req.auth_context.actor_id, req.params.id as `custom_${string}`, req.body, false)
  return res.json({ permission })
}

import { randomUUID } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listCustomPermissions, requireSuperadmin, saveCustomPermission } from "../../../../lib/admin-access/repository"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireSuperadmin(req.auth_context.actor_id)
  return res.json({ permissions: await listCustomPermissions() })
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const permission = await saveCustomPermission(req.auth_context.actor_id, `custom_${randomUUID()}`, req.body, true)
  return res.status(201).json({ permission })
}

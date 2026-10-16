import { randomUUID } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listRoles, requireSuperadmin, saveRole } from "../../../../lib/admin-access/repository"
import { roleInput, parseAccessInput } from "../../../../lib/admin-access/validation"
import type { AdminPermission } from "../../../../shared/admin-access"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireSuperadmin(req.auth_context.actor_id)
  return res.json({ roles: await listRoles() })
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const input = parseAccessInput(roleInput, req.body)
  const role = await saveRole(req.auth_context.actor_id, { ...input, id: `arole_${randomUUID()}`, permissions: input.permissions as AdminPermission[] }, true)
  return res.status(201).json({ role })
}

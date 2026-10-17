import { randomUUID } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listRoles, listCustomPermissions, requireSuperadmin, saveRole } from "../../../../lib/admin-access/repository"
import { roleInput, parseAccessInput } from "../../../../lib/admin-access/validation"
import type { AdminPermission } from "../../../../shared/admin-access"
import { adminRoleCatalog } from "../../../../shared/admin-role-catalog"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireSuperadmin(req.auth_context.actor_id)
  const [roles, permissions] = await Promise.all([listRoles(), listCustomPermissions()])
  return res.json({ roles, role_catalog: adminRoleCatalog(permissions.map(permission => permission.id)) })
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const input = parseAccessInput(roleInput, req.body)
  const role = await saveRole(req.auth_context.actor_id, { ...input, id: `arole_${randomUUID()}`, permissions: input.permissions as AdminPermission[] }, true)
  return res.status(201).json({ role })
}

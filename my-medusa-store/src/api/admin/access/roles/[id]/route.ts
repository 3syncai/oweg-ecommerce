import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { saveRole } from "../../../../../lib/admin-access/repository"
import { roleInput, parseAccessInput } from "../../../../../lib/admin-access/validation"
import type { AdminPermission } from "../../../../../shared/admin-access"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const input = parseAccessInput(roleInput, req.body)
  const role = await saveRole(req.auth_context.actor_id, { ...input, id: req.params.id, permissions: input.permissions as AdminPermission[] }, false)
  return res.json({ role })
}

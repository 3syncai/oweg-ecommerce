import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { assignAccount, deleteAdminAccount } from "../../../../../lib/admin-access/repository"
import { assignmentInput, parseAccessInput } from "../../../../../lib/admin-access/validation"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const input = parseAccessInput(assignmentInput, req.body)
  await assignAccount(req.auth_context.actor_id, req.params.id, input.role_id, input.active)
  return res.json({ success: true })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await deleteAdminAccount(req.auth_context.actor_id, req.params.id, req.body)
  return res.json({ success: true })
}

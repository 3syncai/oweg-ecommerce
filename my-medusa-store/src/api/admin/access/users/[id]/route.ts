import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { assignAccount } from "../../../../../lib/admin-access/repository"
import { assignmentInput, parseAccessInput } from "../../../../../lib/admin-access/validation"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const input = parseAccessInput(assignmentInput, req.body)
  await assignAccount(req.auth_context.actor_id, req.params.id, input.role_id, input.active)
  return res.json({ success: true })
}

import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resetSubadminPassword } from "../../../../../../lib/admin-access/provisioning"
import { credentialInput, parseAccessInput } from "../../../../../../lib/admin-access/validation"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const input = parseAccessInput(credentialInput, req.body || {})
  const credentials = await resetSubadminPassword(req.scope, req.auth_context.actor_id, req.params.id, input.password)
  return res.json({ credentials })
}

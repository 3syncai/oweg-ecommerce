import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listAccounts, requireSuperadmin } from "../../../../lib/admin-access/repository"
import { provisionSubadmin } from "../../../../lib/admin-access/provisioning"
import { accountInput, parseAccessInput } from "../../../../lib/admin-access/validation"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await requireSuperadmin(req.auth_context.actor_id)
  return res.json({ users: await listAccounts() })
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const input = parseAccessInput(accountInput, req.body)
  return res.status(201).json(await provisionSubadmin(req.scope, req.auth_context.actor_id, input))
}

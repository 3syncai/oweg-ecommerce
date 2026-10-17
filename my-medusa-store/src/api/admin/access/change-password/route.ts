import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { changePasswordInput, parseAccessInput } from "../../../../lib/admin-access/validation"
import { changeOwnAdminPassword } from "../../../../lib/admin-access/change-password"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const input = parseAccessInput(changePasswordInput, req.body)
  await changeOwnAdminPassword(req.scope, req.auth_context.actor_id, input.current_password, input.new_password)
  req.session?.destroy(() => undefined)
  return res.json({ message: "Password changed. Please sign in with your new password." })
}

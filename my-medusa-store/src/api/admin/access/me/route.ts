import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getAdminAccess, publicAccess } from "../../../../lib/admin-access/repository"
import { ADMIN_PERMISSION_GROUPS } from "../../../../shared/admin-access"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const checked = res.locals.owegAdminAccess
  const account = checked?.user_id === req.auth_context.actor_id
    ? checked
    : await getAdminAccess(req.auth_context.actor_id)
  if (!account) return res.status(401).json({ message: "Admin account not found" })
  return res.json({ access: publicAccess(account), permission_groups: ADMIN_PERMISSION_GROUPS })
}

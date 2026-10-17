import type { IAuthModuleService, MedusaContainer } from "@medusajs/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { getSharedDbPool } from "../db-pool"
import { accessTransaction, audit, getAdminAccess } from "./repository"

export async function changeOwnAdminPassword(container: MedusaContainer, actor: string, currentPassword: string, newPassword: string) {
  if (newPassword.length < 12 || newPassword.length > 128 || !/[a-z]/.test(newPassword) ||
      !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^a-zA-Z0-9\s]/.test(newPassword)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Use 12–128 characters with uppercase, lowercase, a number and a symbol")
  }
  if (currentPassword === newPassword) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a password different from your temporary password")
  return accessTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`oweg-admin:${actor}`])
    const access = await getAdminAccess(actor)
    if (!access?.active || access.kind !== "subadmin") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Active subadmin account required")
    const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
    const verified = await auth.authenticate("emailpass", { body: { email: access.email, password: currentPassword } })
    if (!verified.success || verified.authIdentity?.app_metadata?.user_id !== actor) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Your current password is incorrect")
    }
    // Fail closed if provider update or the final transaction fails: old sessions are revoked first.
    const cutoff = Math.ceil(Date.now() / 1000)
    // This independent update persists even if provider update succeeds and COMMIT later fails.
    await getSharedDbPool().query("UPDATE oweg_admin_account SET token_valid_after=$2 WHERE user_id=$1", [actor, cutoff])
    const result = await auth.updateProvider("emailpass", { entity_id: access.email, password: newPassword })
    if (!result.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unable to update your password. Try again or contact your superadmin.")
    await client.query("UPDATE oweg_admin_account SET must_change_password=false,updated_at=now() WHERE user_id=$1", [actor])
    await audit(client, actor, "credentials.changed", actor)
  })
}

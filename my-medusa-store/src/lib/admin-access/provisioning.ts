import { adminSiteUrl, emailAdminCredentials } from "./credential-mail"
import { randomBytes } from "node:crypto"
import type { MedusaContainer, IAuthModuleService, IUserModuleService } from "@medusajs/types"
import { Modules, MedusaError } from "@medusajs/framework/utils"
import { getSharedDbPool } from "../db-pool"
import { accessTransaction, assignAccount, audit, getAdminAccess, requireSuperadmin } from "./repository"

export function adminPassword(input?: unknown): string {
  if (input === undefined || input === "") return randomBytes(24).toString("base64url")
  if (typeof input !== "string" || input.length < 12 || input.length > 128) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Password must contain 12 to 128 characters")
  }
  return input
}

export async function createAdminIdentity(container: MedusaContainer, input: { email: string; password: string; first_name?: string; last_name?: string }) {
  const users = container.resolve<IUserModuleService>(Modules.USER)
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
  const existing = await users.listUsers({ email: input.email })
  if (existing.length) throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "This admin already exists. Assign their role from the accounts list.")
  const registration = await auth.register("emailpass", { body: { email: input.email, password: input.password } })
  if (!registration.success || !registration.authIdentity) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "This email cannot be provisioned. It may already have a login identity; choose another email or assign its existing admin account.")
  }
  const identityId = registration.authIdentity.id
  let userId: string | undefined
  try {
    const user = await users.createUsers({ email: input.email, first_name: input.first_name, last_name: input.last_name })
    userId = user.id
    await auth.updateAuthIdentities({ id: identityId, app_metadata: { ...registration.authIdentity.app_metadata, user_id: user.id } })
    return { user, identityId }
  } catch (error) {
    await auth.deleteAuthIdentities([identityId])
    if (userId) await users.deleteUsers([userId])
    throw error
  }
}

export async function provisionSubadmin(container: MedusaContainer, actor: string, input: { email: string; password?: string; first_name?: string; last_name?: string; role_id: string }) {
  await requireSuperadmin(actor)
  adminSiteUrl()
  const role = await getSharedDbPool().query("SELECT id,name FROM oweg_admin_role WHERE id=$1", [input.role_id])
  if (!role.rows.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose an existing role")
  const password = adminPassword(input.password)
  const { user, identityId } = await createAdminIdentity(container, { ...input, password })
  try { await assignAccount(actor, user.id, input.role_id, true, true) } catch (error) {
    await container.resolve<IAuthModuleService>(Modules.AUTH).deleteAuthIdentities([identityId])
    await container.resolve<IUserModuleService>(Modules.USER).deleteUsers([user.id])
    throw error
  }
  const email_status = await emailAdminCredentials({ email: user.email, password, name: input.first_name, role: role.rows[0].name })
  // This is the only response containing the password; it is never stored in our tables/audit log.
  return { user: { id: user.id, email: user.email }, credentials: { email: user.email, password, email_status } }
}

export async function resetSubadminPassword(container: MedusaContainer, actor: string, userId: string, input?: unknown) {
  await requireSuperadmin(actor)
  adminSiteUrl()
  const password = adminPassword(input)
  const target = await getAdminAccess(userId)
  if (!target || target.kind !== "subadmin") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only subadmin credentials can be reset here")
  await accessTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`oweg-admin:${userId}`])
    // Revoke existing sessions before changing the credential; failure leaves old sessions revoked.
    // JWT issue times come from the application clock, not the remote database clock.
    await getSharedDbPool().query("UPDATE oweg_admin_account SET must_change_password=true,token_valid_after=$2,updated_at=now() WHERE user_id=$1 AND kind='subadmin'", [userId, Math.ceil(Date.now() / 1000)])
    const result = await container.resolve<IAuthModuleService>(Modules.AUTH).updateProvider("emailpass", { entity_id: target.email, password })
    if (!result.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unable to reset this account's login identity")
    await audit(client, actor, "credentials.reset", userId)
  })
  const email_status = await emailAdminCredentials({ email: target.email, password, name: target.first_name || undefined, role: target.role_name || "Subadmin", reset: true })
  return { email: target.email, password, email_status }
}

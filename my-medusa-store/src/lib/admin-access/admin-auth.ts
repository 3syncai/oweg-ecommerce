import type { IAuthModuleService, MedusaContainer } from "@medusajs/types"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { getAuthContextFromJwtToken } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

const ADMIN_LOGIN_PREFIX = "oweg-admin:"

/** Internal provider key only. People always enter their normal email address. */
export function adminLoginId(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@:]+@[^\s@:]+\.[^\s@:]+$/.test(normalized)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a valid admin email")
  return `${ADMIN_LOGIN_PREFIX}${normalized}`
}

export function adminLoginEmail(identifier: string): string {
  return identifier.startsWith(ADMIN_LOGIN_PREFIX) ? identifier.slice(ADMIN_LOGIN_PREFIX.length) : identifier
}

export async function resolveAdminLoginId(container: MedusaContainer, email: string): Promise<string> {
  const identifier = adminLoginId(email)
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
  const scoped = await auth.listProviderIdentities({ provider: "emailpass", entity_id: identifier })
  if (scoped.length) return identifier
  // Move legacy admin-only credentials without changing their password hash or
  // identity ID. Never move a customer's/vendor's provider or share its password.
  const legacy = await auth.listProviderIdentities({ provider: "emailpass", entity_id: email.trim().toLowerCase() })
  if (legacy.length === 1 && legacy[0].auth_identity_id) {
    const identity = await auth.retrieveAuthIdentity(legacy[0].auth_identity_id)
    if (identity.app_metadata?.user_id && !identity.app_metadata.customer_id && !identity.app_metadata.vendor_id) {
      try { await auth.updateProviderIdentities({ id: legacy[0].id, entity_id: identifier }) }
      catch (error) {
        // Another request may have performed the same migration concurrently.
        if (!(await auth.listProviderIdentities({ provider: "emailpass", entity_id: identifier })).length) throw error
      }
    }
  }
  return identifier
}

export async function scopeAdminLogin(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  try {
    if (req.method !== "POST") return next()
    const path = (req.originalUrl || req.url).split("?")[0].replace(/\/$/, "")
    if (path === "/auth/user/emailpass/register") return res.status(403).json({ message: "Create admin accounts through Admin Access" })
    if (path === "/auth/user/emailpass/update") {
      const { projectConfig: { http } } = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
      const token = getAuthContextFromJwtToken(req.headers.authorization, http.jwtSecret, ["bearer"], ["user"], http.jwtPublicKey, http.jwtVerifyOptions ?? http.jwtOptions) as { entity_id?: string } | null
      // Reject pre-separation reset links too: a user-scoped token must never
      // update an ordinary customer provider identity.
      if (typeof token?.entity_id !== "string" || !token.entity_id.startsWith(ADMIN_LOGIN_PREFIX)) return res.status(401).json({ message: "Request a new admin password reset link" })
    }
    if (path === "/auth/customer/emailpass/register") {
      const email = (req.body as { email?: unknown })?.email
      // Existing admins can become customers too. Free the ordinary email key
      // only when it belongs exclusively to a legacy admin credential.
      if (typeof email === "string") await resolveAdminLoginId(req.scope, email)
    }
    const field = path === "/auth/user/emailpass" ? "email" : path === "/auth/user/emailpass/reset-password" ? "identifier" : null
    if (field) {
      const body = req.body as Record<string, unknown> | undefined
      if (typeof body?.[field] === "string") {
        const identifier = await resolveAdminLoginId(req.scope, body[field] as string)
        body[field] = identifier
        const validated = req.validatedBody as Record<string, unknown> | undefined
        if (validated) validated[field] = identifier
      }
    }
    return next()
  } catch (error) { return next(error) }
}

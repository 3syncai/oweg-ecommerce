import { getAuthContextFromJwtToken, type AuthenticatedMedusaRequest, type MedusaRequest, type MedusaResponse, type MedusaNextFunction } from "@medusajs/framework/http"
import { adminApiPath, canAccessAdminApi, canServiceKeyAccess } from "./policy"
import { getAdminAccess } from "./repository"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IStoreModuleService } from "@medusajs/types"
import { activityContext } from "./activity-context"

/** Native JWT refresh must not turn a revoked admin token into a fresh session. */
export async function enforceAdminTokenRefresh(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  try {
    const { projectConfig: { http } } = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
    const context = getAuthContextFromJwtToken(req.headers.authorization, http.jwtSecret, ["bearer"], ["user"], http.jwtPublicKey, http.jwtVerifyOptions ?? http.jwtOptions)
    // Customer/vendor token validation remains with the native auth middleware.
    if (!context) return next()
    const access = context.actor_id ? await getAdminAccess(context.actor_id) : null
    if (!access?.active || Number(access.token_valid_after) > Number((context as unknown as { iat?: number }).iat || 0)) {
      return res.status(401).json({ message: "Your credentials have changed. Please sign in again." })
    }
    return next()
  } catch (error) { return next(error) }
}

export async function enforceAdminAccess(req: AuthenticatedMedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const path = adminApiPath(req.originalUrl || req.url)
  const context = req.auth_context
  if (!context?.actor_id) return res.status(401).json({ message: "Sign in with your admin account" })
  res.setHeader("Cache-Control", "no-store")
  if (context.actor_type === "api-key") {
    return canServiceKeyAccess(req.method, path) ? next() : res.status(403).json({ message: "Service keys cannot manage admin access" })
  }
  if (context.actor_type !== "user") return res.status(403).json({ message: "Admin access required" })
  try {
    const access = await getAdminAccess(context.actor_id)
    if (!access) return res.status(401).json({ message: "Admin account no longer exists" })
    const activity = activityContext.getStore()
    if (activity) activity.actor = access
    const issuedAt = Number((context as unknown as { iat?: number }).iat || 0)
    if (Number(access.token_valid_after) > issuedAt) {
      return res.status(401).json({ message: "Your credentials have changed. Please sign in again." })
    }
    // The shell can explain missing/revoked access without exposing business data.
    if (req.method === "GET" && ["/admin/access/me", "/admin/users/me"].includes(path)) return next()
    if (req.method === "POST" && path === "/admin/access/change-password" && access.active && access.kind === "subadmin") return next()
    // Medusa's layout requires the store name even on the password screen.
    // Return only shell metadata; never use the full stores/notifications handlers.
    if (access.must_change_password && req.method === "GET") {
      if (path === "/admin/feature-flags") return res.json({ feature_flags: {} })
      if (path === "/admin/notifications") return res.json({ notifications: [], count: 0, offset: 0, limit: 0 })
      if (path === "/admin/stores") {
        const stores = await req.scope.resolve<IStoreModuleService>(Modules.STORE).listStores({}, { select: ["id", "name"] })
        return res.json({ stores: stores.map(({ id, name }) => ({ id, name })), count: stores.length, offset: 0, limit: stores.length })
      }
    }
    if (access.must_change_password) return res.status(403).json({ code: "password_change_required", message: "Set a new password before accessing your admin responsibilities." })
    // Reporting is limited to the current admin; reading history stays reserved.
    if (req.method === "POST" && path === "/admin/access/activity/page-view") return next()
    if (req.method === "GET" && path === "/admin/feature-flags" && (!access.active || !access.permissions.length)) return res.json({ feature_flags: {} })
    if (req.method === "GET" && path === "/admin/stores" && (!access.active || !access.permissions.length)) {
      const stores = await req.scope.resolve<IStoreModuleService>(Modules.STORE).listStores({}, { select: ["id", "name"] })
      return res.json({ stores, count: stores.length, offset: 0, limit: stores.length })
    }
    if (!canAccessAdminApi(access, req.method, path)) return res.status(403).json({ message: "You do not have permission for this area. Contact the superadmin." })
    // Native invites bypass the role/credential provisioning flow. Use our account manager.
    if (path.startsWith("/admin/invites") && !["GET", "HEAD"].includes(req.method)) {
      return res.status(403).json({ message: "Create subadmins from Admin Access instead of invitations" })
    }
    // Prevent accidental deletion of the sole superadmin via native Medusa user settings.
    if (req.method === "DELETE" && path.startsWith("/admin/users/")) {
      const target = await getAdminAccess(path.split("/")[3])
      if (target?.kind === "superadmin") return res.status(403).json({ message: "The superadmin cannot be deleted through the dashboard" })
    }
    return next()
  } catch (error) {
    // Database/configuration failures always fail closed.
    return next(error)
  }
}

import { randomUUID } from "node:crypto"
import { getAuthContextFromJwtToken, type AuthenticatedMedusaRequest, type MedusaRequest, type MedusaResponse, type MedusaNextFunction } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getSharedDbPool } from "../db-pool"
import { activityContext, activityResourceId, changedActivityFields, cleanActivityText, requestActivityContext, safeActivityPath } from "./activity-context"
import { insertAdminActivity } from "./activity-store"
import { getAdminAccess } from "./repository"
import { adminLoginEmail } from "./admin-auth"

/** Observe completion without changing authentication, response bodies or status. */
export function recordAdminActivity(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const path = safeActivityPath(req.originalUrl || req.url)
  const authentication = path.startsWith("/auth/user/") || path === "/auth/session" || path === "/auth/token/refresh"
  if (req.method === "OPTIONS" || (!authentication && !path.startsWith("/admin/"))) return next()
  const context = requestActivityContext(req, randomUUID())
  const start = performance.now()
  const initialAuth = (req as AuthenticatedMedusaRequest).auth_context || req.session?.auth_context
  let responseAuth: typeof initialAuth | undefined
  let resourceId: string | null = null
  {
    const originalJson = res.json.bind(res)
    res.json = (body: any) => {
      if (!authentication && !["GET", "HEAD"].includes(req.method) && res.statusCode < 400) resourceId = activityResourceId(body)
      // Verify only server-generated login tokens and retain identity alone.
      if (path.startsWith("/auth/user/") && res.statusCode < 400 && typeof body?.token === "string") {
        const { projectConfig: { http } } = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
        responseAuth = getAuthContextFromJwtToken(`Bearer ${body.token}`, http.jwtSecret, ["bearer"], ["user"], http.jwtPublicKey, http.jwtVerifyOptions ?? http.jwtOptions) || undefined
      }
      return originalJson(body)
    }
  }
  let recorded = false
  const record = (aborted = false) => {
    if (recorded) return
    recorded = true
    const status = aborted ? 499 : res.statusCode
    // Successful page reports already have a navigation record. Invalid or
    // rate-limited reports still appear as failed API attempts.
    if (path === "/admin/access/activity/page-view" && status < 400) return
    const duration = Math.min(2147483647, Math.round(performance.now() - start))
    const auth = responseAuth || (req as AuthenticatedMedusaRequest).auth_context || initialAuth
    if (auth?.actor_type && auth.actor_type !== "user") return
    void (async () => {
      let actorId = auth?.actor_id || "anonymous"
      if (!context.actor && auth?.actor_id) context.actor = await getAdminAccess(auth.actor_id) || undefined
      if (authentication && path.startsWith("/auth/user/") && !auth?.actor_id) {
        const email = adminLoginEmail(cleanActivityText((req.body as { email?: unknown })?.email, 280)).toLowerCase()
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          const { rows } = await getSharedDbPool().query('SELECT id FROM "user" WHERE lower(email)=$1 AND deleted_at IS NULL LIMIT 1', [email])
          if (rows[0]) {
            actorId = rows[0].id
            context.actor = await getAdminAccess(actorId) || undefined
          } else context.actor = { user_id: actorId, email, kind: "unverified" }
        }
      }
      if (authentication && !path.startsWith("/auth/user/") && !auth?.actor_id) return
      const action = authentication
        ? path === "/auth/session" ? (req.method === "DELETE" ? "auth.logout" : "auth.session_created")
          : /^\/auth\/user\/[^/]+$/.test(path) ? (status < 400 ? "auth.login" : "auth.login_failed") : "auth.request"
        : `api.${req.method.toLowerCase()}`
      await insertAdminActivity(getSharedDbPool(), {
        actor_id: actorId, action, target_id: resourceId || path, category: authentication ? "authentication" : "api",
        method: req.method, path, status_code: status, duration_ms: duration, context,
        details: { authenticated: !!auth?.actor_id, ...(authentication ? {} : { changed_fields: changedActivityFields(req.body) }) },
      })
    })().catch(error => {
      console.error("[admin-activity] Failed to persist event", { request_id: context.request_id, code: typeof error?.code === "string" ? error.code : "AUDIT_WRITE_FAILED" })
    })
  }
  res.once("finish", () => record())
  res.once("close", () => { if (!res.writableFinished) record(true) })
  activityContext.run(context, next)
}

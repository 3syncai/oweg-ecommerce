import { randomUUID } from "node:crypto"
import type { Pool, PoolClient } from "pg"
import { activityContext, type ActivityContext } from "./activity-context"

export type ActivityEvent = {
  actor_id: string; action: string; target_id: string; details?: Record<string, unknown>
  category: "access_change" | "api" | "authentication" | "navigation"
  method?: string; path?: string; status_code?: number; duration_ms?: number
  context?: ActivityContext
}

export async function insertAdminActivity(db: Pick<Pool | PoolClient, "query">, event: ActivityEvent) {
  const context = event.context || activityContext.getStore()
  const actor = context?.actor
  await db.query(`INSERT INTO oweg_admin_audit
    (id,actor_id,action,target_id,details,category,actor_email,actor_name,actor_role,actor_kind,request_id,method,path,status_code,duration_ms,ip_address,user_agent,location)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)`, [
    `aaudit_${randomUUID()}`, event.actor_id, event.action, event.target_id, JSON.stringify(event.details || {}), event.category,
    actor?.email || null, actor ? [actor.first_name, actor.last_name].filter(Boolean).join(" ") || null : null,
    actor?.role_name || null, actor?.kind || null, context?.request_id || null, event.method || null, event.path || null,
    event.status_code ?? null, event.duration_ms ?? null, context?.ip_address || null, context?.user_agent || null,
    JSON.stringify(context?.location || { source: "unavailable" }),
  ])
}

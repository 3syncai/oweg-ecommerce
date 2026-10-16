import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { getSharedDbPool } from "../../../../lib/db-pool"
import { requireSuperadmin } from "../../../../lib/admin-access/repository"
import { parseAccessInput } from "../../../../lib/admin-access/validation"
import { activityViewCtes } from "../../../../lib/admin-access/activity-feed"

const filters = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
    view: z.enum(["activity", "technical"]).default("activity"),
    actor_id: z.string().max(200).optional(),
    category: z
      .enum([
        "all",
        "authentication",
        "navigation",
        "api",
        "access_change",
        "changes",
      ])
      .default("all"),
    result: z.enum(["all", "success", "denied", "failed"]).default("all"),
    q: z.string().trim().max(100).default(""),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    before: z.string().datetime().optional(),
  })
  .strict()

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await requireSuperadmin(req.auth_context.actor_id)
  const input = parseAccessInput(filters, req.query)
  const snapshot = input.before || new Date().toISOString()
  const values: unknown[] = [snapshot]
  // Group before applying display filters/pagination, so counts and page
  // boundaries describe the same activity feed and never merge across actions.
  const ctes = `WITH audit_snapshot AS (SELECT * FROM oweg_admin_audit WHERE created_at <= $1::timestamptz), ${activityViewCtes(input.view)}`
  const clauses = ["TRUE"]
  const add = (condition: string, value: unknown) => {
    values.push(value)
    clauses.push(condition.replace("?", `$${values.length}`))
  }
  if (input.actor_id) add("a.actor_id = ?", input.actor_id)
  if (input.category === "changes")
    clauses.push(
      "(a.category='access_change' OR (a.category='api' AND a.method NOT IN ('GET','HEAD')))"
    )
  else if (input.category !== "all") add("a.category = ?", input.category)
  if (input.result === "success")
    clauses.push("COALESCE(a.status_code,200) < 400")
  if (input.result === "denied") clauses.push("a.status_code IN (401,403)")
  if (input.result === "failed")
    clauses.push("a.status_code >= 400 AND a.status_code NOT IN (401,403)")
  if (input.from) add("a.created_at >= ?::timestamptz", input.from)
  if (input.to) add("a.created_at < ?::timestamptz", input.to)
  if (input.q) {
    values.push(`%${input.q.replace(/[\\%_]/g, (value) => `\\${value}`)}%`)
    const p = `$${values.length}`
    clauses.push(
      `(COALESCE(a.actor_email,u.email,'') ILIKE ${p} OR a.action ILIKE ${p} OR a.path ILIKE ${p} OR a.target_id ILIKE ${p} OR a.ip_address ILIKE ${p} OR a.location->>'city' ILIKE ${p} OR a.location->>'country' ILIKE ${p})`
    )
  }
  const from = `FROM activity_events a LEFT JOIN "user" u ON u.id=a.actor_id WHERE ${clauses.join(" AND ")}`
  const [summary, events] = await Promise.all([
    getSharedDbPool().query(
      `${ctes} SELECT COUNT(*)::int AS count, COUNT(DISTINCT a.actor_id)::int AS admins,
      COUNT(*) FILTER (WHERE a.status_code IN (401,403))::int AS denied,
      COUNT(*) FILTER (WHERE a.status_code >= 400 AND a.status_code NOT IN (401,403))::int AS failed ${from}`,
      values
    ),
    getSharedDbPool().query(
      `${ctes} SELECT a.*, COALESCE(a.actor_email,u.email) AS actor_email ${from}
      ORDER BY a.created_at DESC,a.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, input.limit, input.offset]
    ),
  ])
  return res.json({
    events: events.rows,
    ...summary.rows[0],
    view: input.view,
    limit: input.limit,
    offset: input.offset,
    snapshot_at: snapshot,
  })
}

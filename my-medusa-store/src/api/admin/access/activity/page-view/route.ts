import { randomUUID } from "node:crypto"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { getSharedDbPool } from "../../../../../lib/db-pool"
import { getAdminAccess } from "../../../../../lib/admin-access/repository"
import { parseAccessInput } from "../../../../../lib/admin-access/validation"
import { requestActivityContext } from "../../../../../lib/admin-access/activity-context"
import { insertAdminActivity } from "../../../../../lib/admin-access/activity-store"
import { canAccessAdminPage } from "../../../../../shared/admin-access"

const inputSchema = z.object({ page_path: z.string().max(500).regex(/^\/app(?:\/[a-zA-Z0-9_-]+)*\/?$/).refine(path => !/^\/app\/(login|reset-password|invite)(\/|$)/.test(path)) }).strict()
const windows = new Map<string, { start: number; count: number }>()
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { page_path } = parseAccessInput(inputSchema, req.body)
  const actor = await getAdminAccess(req.auth_context.actor_id)
  if (!actor) return res.status(401).json({ message: "Admin account no longer exists" })
  const now = Date.now()
  for (const [id, window] of windows) if (now - window.start > 60000) windows.delete(id)
  const window = windows.get(actor.user_id) || { start: now, count: 0 }
  if (++window.count > 120) return res.status(429).json({ message: "Too many navigation events" })
  windows.set(actor.user_id, window)
  const context = requestActivityContext(req, randomUUID())
  context.actor = actor
  const allowed = canAccessAdminPage(actor, page_path)
  await insertAdminActivity(getSharedDbPool(), { actor_id: actor.user_id, action: allowed ? "page.viewed" : "page.denied", target_id: page_path, category: "navigation", path: page_path, status_code: allowed ? 200 : 403, details: { source: "browser_navigation" }, context })
  return res.status(202).json({ recorded: true })
}

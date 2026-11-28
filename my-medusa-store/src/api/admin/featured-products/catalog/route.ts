import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { readFeaturedPickerPage } from "../../../../lib/featured-products"
import { checkRateLimit } from "../../../../lib/simple-rate-limit"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { q = "", cursor = null } = req.query
  if (typeof q !== "string" || q.length > 100 ||
      (cursor !== null && (typeof cursor !== "string" || !/^prod_[a-zA-Z0-9_-]{1,100}$/.test(cursor)))) {
    return res.status(400).json({ message: "Enter a valid search or start again from the first page." })
  }

  const actor = req.auth_context?.actor_id
  if (actor) {
    const limit = checkRateLimit({ key: "featured-products-catalog:" + actor, limit: 90, windowMs: 60_000 })
    if (!limit.allowed) return res.set("Retry-After", String(limit.retryAfterSec)).status(429).json({ message: "Too many catalog requests. Try again shortly." })
  }
  const page = await readFeaturedPickerPage(req, q.trim(), cursor)
  return res.set("Cache-Control", "no-store").json(page)
}

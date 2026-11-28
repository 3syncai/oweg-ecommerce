import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { addFeaturedPickerDetails, publishFeaturedProducts, readFeaturedProducts } from "../../../lib/featured-products"
import { checkRateLimit } from "../../../lib/simple-rate-limit"
import { parseFeaturedProducts, type FeaturedPickerProduct } from "../../../shared/featured-products"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const state = await readFeaturedProducts(req)
  const ids = state.config.product_ids
  const catalog = req.scope.resolve(Modules.PRODUCT)
  const products: FeaturedPickerProduct[] = []
  for (let offset = 0; offset < ids.length; offset += 60) {
    const batch = ids.slice(offset, offset + 60)
    const found = await catalog.listProducts(
      { id: batch }, { take: batch.length, select: ["id", "title", "status", "thumbnail"] }
    )
    products.push(...await addFeaturedPickerDetails(req, found))
  }
  return res.set("Cache-Control", "no-store").json({ ...state, products })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actor = req.auth_context?.actor_id
  if (actor) {
    const limit = checkRateLimit({ key: "featured-products-publish:" + actor, limit: 30, windowMs: 60000 })
    if (!limit.allowed) return res.set("Retry-After", String(limit.retryAfterSec)).status(429).json({ message: "Too many publish attempts. Try again shortly." })
  }

  const { config: input, revision } = (req.body ?? {}) as { config?: unknown; revision?: unknown }
  const config = parseFeaturedProducts(input)
  if (!config || (revision !== null && (typeof revision !== "string" || revision.length !== 36))) {
    return res.status(400).json({ message: "Enter a title and select unique products." })
  }

  const ids = config.product_ids
  if (ids.length) {
    const catalog = req.scope.resolve(Modules.PRODUCT)
    const invalid: string[] = []
    for (let offset = 0; offset < ids.length; offset += 60) {
      const batch = ids.slice(offset, offset + 60)
      const products = await catalog.listProducts(
        { id: batch, status: ["published"] }, { take: batch.length, select: ["id"] }
      )
      const available = new Set(products.map(product => product.id))
      invalid.push(...batch.filter(id => !available.has(id)))
    }
    if (invalid.length) return res.status(400).json({ message: "Remove unpublished or deleted products before publishing.", invalid_product_ids: invalid })
  }

  const nextRevision = await publishFeaturedProducts(req, config, revision)
  if (!nextRevision) return res.status(409).json({ message: "The saved selection changed. Reload the editor before publishing again." })
  return res.json({ config, revision: nextRevision })
}

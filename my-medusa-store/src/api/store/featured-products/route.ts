import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { readFeaturedProducts } from "../../../lib/featured-products"
import { featuredProductsPageSize, isFeaturedProductsCursor } from "../../../shared/featured-products"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cursor = req.query.cursor
  if (cursor !== undefined && (typeof cursor !== "string" || !isFeaturedProductsCursor(cursor))) {
    return res.status(400).json({ message: "Invalid featured products cursor." })
  }

  const { config, revision } = await readFeaturedProducts(req)
  const [expectedRevision, position] = typeof cursor === "string" ? cursor.split(":") : []
  const offset = position ? Number(position) : 0
  if (expectedRevision && (expectedRevision !== revision || offset >= config.product_ids.length || offset % featuredProductsPageSize !== 0)) {
    return res.status(409).json({ message: "The featured selection has changed." })
  }

  const end = offset + featuredProductsPageSize
  const next_cursor = revision && end < config.product_ids.length ? `${revision}:${end}` : null
  return res.set("Cache-Control", "public, max-age=0, s-maxage=15").json({
    title: config.title,
    product_ids: config.product_ids.slice(offset, end),
    next_cursor,
  })
}

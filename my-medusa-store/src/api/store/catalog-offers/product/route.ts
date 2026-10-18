import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getSharedDbPool } from "../../../../lib/db-pool"

/** Published listings linked to one catalog product, including sizes sold by only one vendor. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productId = String(req.query.product_id || "")
  if (!productId || productId.length > 255) return res.status(400).json({ message: "product_id required" })
  try {
    const { rows } = await getSharedDbPool().query<{ id: string; catalog_id: string }>(`
      WITH origin AS (
        SELECT COALESCE(NULLIF(metadata->>'catalog_product_id', ''), id) AS catalog_id
        FROM product WHERE id = $1 AND deleted_at IS NULL
      )
      SELECT p.id, origin.catalog_id
      FROM origin JOIN product p
        ON COALESCE(NULLIF(p.metadata->>'catalog_product_id', ''), p.id) = origin.catalog_id
      WHERE p.deleted_at IS NULL AND p.status = 'published'
        AND COALESCE(p.metadata->>'approval_status', 'approved') = 'approved'
        AND NULLIF(p.metadata->>'vendor_id', '') IS NOT NULL
      ORDER BY (p.id = origin.catalog_id) DESC, p.created_at ASC
    `, [productId])
    return res.json({ catalog_product_id: rows[0]?.catalog_id || productId, product_ids: rows.map(row => row.id) })
  } catch (error) {
    console.error("[catalog-offers] product group failed", error)
    return res.status(503).json({ message: "Catalog product unavailable" })
  }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getSharedDbPool } from "../../../lib/db-pool"
import { setWishlistItem } from "../../../lib/customer-wishlist"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Customer authentication required" })
  const body = req.body as { productId?: unknown; saved?: unknown } | undefined
  if (typeof body?.productId !== "string" || !body.productId.trim() || body.productId.length > 200 || typeof body.saved !== "boolean") {
    return res.status(400).json({ message: "A product id and explicit saved state are required" })
  }
  const productId = body.productId.trim()
  const pool = getSharedDbPool()
  if (body.saved) {
    const product = await pool.query("SELECT id FROM product WHERE id = $1 AND deleted_at IS NULL", [productId])
    if (!product.rowCount) return res.status(404).json({ message: "Product unavailable" })
  }
  const wishlist = await setWishlistItem(pool, customerId, productId, body.saved)
  if (!wishlist) return res.status(404).json({ message: "Customer unavailable" })
  res.setHeader("Cache-Control", "private, no-store")
  return res.json({ wishlist })
}

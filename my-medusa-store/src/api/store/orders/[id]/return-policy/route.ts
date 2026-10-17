import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { Pool } from "pg"
import { resolveReturnPolicyForProduct } from "../../../../../lib/vendor-return-policy"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as MedusaRequest & {
    auth_context?: { actor_id?: string }
  }).auth_context?.actor_id
  if (!customerId) return res.status(401).json({ message: "Customer authentication required" })

  const order = await req.scope.resolve(Modules.ORDER).retrieveOrder(req.params.id, {
    relations: ["items"],
  })
  if (order.customer_id !== customerId) return res.status(403).json({ message: "Forbidden" })

  const productIds = [...new Set((order.items || [])
    .map((item: any) => item.product_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0))]
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const categories = productIds.length
      ? await pool.query<{ product_id: string; category_id: string }>(
          `SELECT product_id, category_id FROM product_category_product
           WHERE product_id = ANY($1::text[])`,
          [productIds]
        )
      : { rows: [] }
    const idsByProduct = new Map<string, string[]>()
    for (const row of categories.rows) {
      const ids = idsByProduct.get(row.product_id) || []
      ids.push(row.category_id)
      idsByProduct.set(row.product_id, ids)
    }
    let maxReturnDays = 0
    let maxReplacementDays = 0
    for (const productId of productIds) {
      const policy = await resolveReturnPolicyForProduct(pool, idsByProduct.get(productId) || [])
      maxReturnDays = Math.max(maxReturnDays, policy.return_window_days)
      maxReplacementDays = Math.max(maxReplacementDays, policy.replacement_window_days)
    }
    if (!productIds.length) {
      maxReturnDays = 7
      maxReplacementDays = 7
    }
    return res.json({ return_window_days: maxReturnDays, replacement_window_days: maxReplacementDays })
  } finally {
    await pool.end()
  }
}

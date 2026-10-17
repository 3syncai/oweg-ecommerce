import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { publicVariantSku } from "../../../../lib/catalog-identity"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const ids = String(req.query.ids || "").split(",").filter(Boolean)
  if (!ids.length || ids.length > 100) return res.status(400).json({ message: "Provide 1–100 product IDs" })
  const { data } = await req.scope.resolve("query").graph({ entity: "product", filters: { id: ids }, fields: ["id", "metadata", "variants.sku"] })
  return res.json({ products: data.map((p: any) => ({ id: p.id, skus: [...new Set((p.variants || []).map((v: any) => publicVariantSku(p, v)).filter(Boolean))] })) })
}

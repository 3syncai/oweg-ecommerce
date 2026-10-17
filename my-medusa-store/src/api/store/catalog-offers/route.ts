import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listSameSkuOffers, publicSellerOffers } from "../../../lib/vendor-offer-routing"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const variantId = String(req.query.variant_id || "")
  if (!variantId || variantId.length > 255) return res.status(400).json({ message: "variant_id required" })
  try {
    return res.json({ offers: publicSellerOffers(await listSameSkuOffers(variantId)) })
  } catch (error) {
    console.error("[catalog-offers] listing failed", error)
    return res.status(503).json({ message: "Seller offers are temporarily unavailable" })
  }
}

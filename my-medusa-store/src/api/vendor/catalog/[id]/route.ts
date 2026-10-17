import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../_lib/guards"
import { loadShareProduct, sharedProductDraft, validProductShare } from "../../../../lib/product-share"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!await requireApprovedVendor(req, res)) return
  const product = await loadShareProduct(req.scope, req.params.id)
  res.setHeader("Cache-Control", "no-store")
  if (!validProductShare(product, req.query.share)) return res.status(404).json({ message: "This product link has expired or is no longer available. Ask the admin for a new link." })
  return res.json({ product: sharedProductDraft(product) })
}

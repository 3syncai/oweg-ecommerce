import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../../_lib/guards"
import { withCatalogLock } from "../../../../../lib/catalog-identity"
import { OPTIONS as productOptions, updateOffer } from "../route"

// Legacy matrix callers use the same atomic save path as the product editor.
export const OPTIONS = productOptions

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Credentials", "true")
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return
  return withCatalogLock(req.scope, () => updateOffer(req, res, auth, true))
}

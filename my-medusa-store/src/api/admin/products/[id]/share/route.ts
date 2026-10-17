import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { issueProductShare } from "../../../../../lib/product-share"
import { withCatalogLock } from "../../../../../lib/catalog-identity"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return withCatalogLock(req.scope, async () => {
    const service = req.scope.resolve("product") as any
    const product = await service.retrieveProduct(req.params.id)
    const share = issueProductShare()
    const origin = new URL(process.env.VENDOR_SITE_URL || "https://vendor.0weg.in")
    if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))
      return res.status(500).json({ message: "VENDOR_SITE_URL must use HTTPS" })
    await service.updateProducts(product.id, { metadata: { ...product.metadata, catalog_share_hash: share.hash, catalog_share_expires: share.expires } })
    const url = new URL("/products/new", origin.origin)
    url.searchParams.set("shared_product", product.id)
    url.searchParams.set("share", share.token)
    res.setHeader("Cache-Control", "no-store")
    return res.json({ url: url.toString(), expires_at: share.expires })
  })
}

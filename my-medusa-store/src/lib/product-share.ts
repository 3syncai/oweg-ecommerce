import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { publicVariantSku } from "./catalog-identity"

export function issueProductShare() {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: createHash("sha256").update(token).digest("hex"), expires: new Date(Date.now() + 7 * 86400000).toISOString() }
}

export function validProductShare(product: any, token: unknown): boolean {
  if (typeof token !== "string" || token.length > 100 || !product) return false
  const stored = String(product.metadata?.catalog_share_hash || "")
  const actual = createHash("sha256").update(token).digest("hex")
  return /^[a-f0-9]{64}$/.test(stored) && timingSafeEqual(Buffer.from(stored), Buffer.from(actual)) &&
    new Date(product.metadata?.catalog_share_expires || 0).getTime() > Date.now()
}

/** Allowlist catalog fields: never expose another vendor's prices, stock or private metadata. */
export function sharedProductDraft(product: any) {
  const metadata: Record<string, any> = {}
  for (const key of ["brand", "mid_code", "hs_code", "tax_code", "gst_rate", "country_of_origin", "color_images", "primary_visual_option", "videos", "return_window_days", "replacement_window_days"])
    if (product.metadata?.[key] != null) metadata[key] = product.metadata[key]
  return {
    id: product.id, title: product.title, subtitle: product.subtitle, description: product.description,
    images: (product.images || []).map((image: any) => ({ url: image.url })), thumbnail: product.thumbnail,
    weight: product.weight, height: product.height, width: product.width, length: product.length,
    collection_id: product.collection_id, type_id: product.type_id, categories: product.categories || [],
    tags: (product.tags || []).map((tag: any) => ({ value: tag.value })), metadata,
    options: (product.options || []).map((option: any) => ({ title: option.title, values: (option.values || []).map((value: any) => value.value) })),
    variants: (product.variants || []).map((variant: any) => ({
      title: variant.title, sku: publicVariantSku(product, variant),
      options: Object.fromEntries((variant.options || []).map((value: any) => [value.option?.title || (product.options || []).find((o: any) => o.id === value.option_id)?.title, value.value])),
    })),
  }
}

export async function loadShareProduct(scope: any, id: string) {
  const { data } = await scope.resolve("query").graph({ entity: "product", filters: { id },
    fields: ["id", "title", "subtitle", "description", "metadata", "images.*", "thumbnail", "weight", "height", "width", "length", "collection_id", "type_id", "categories.id", "tags.value", "options.*", "options.values.*", "variants.id", "variants.title", "variants.sku", "variants.options.*", "variants.options.option.title"],
  })
  return data?.[0]
}

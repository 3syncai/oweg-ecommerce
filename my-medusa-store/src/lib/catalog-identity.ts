import { createHash } from "node:crypto"
import { getSharedDbPool } from "./db-pool"

export const normalizeCatalogSku = (value: unknown): string => String(value || "").trim().toUpperCase()
const words = (value: unknown): string[] => String(value || "").normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) || []

function distance(a: string, b: string): number {
  if (a.length === b.length) {
    const changed = Array.from(a).map((character, i) => character !== b[i] ? i : -1).filter(i => i >= 0)
    if (changed.length === 2 && changed[1] === changed[0] + 1 && a[changed[0]] === b[changed[1]] && a[changed[1]] === b[changed[0]]) return 1
  }
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const previous = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + Number(a[i - 1] !== b[j - 1]))
      diagonal = previous
    }
  }
  return row[b.length]
}

/** Conservative spelling tolerance. Model numbers, units and short words must match exactly. */
export function sameCatalogName(a: unknown, b: unknown): boolean {
  const left = words(a).sort(), right = words(b).sort()
  if (!left.length || left.length !== right.length) return false
  const unmatched = [...right]
  const missing: string[] = []
  for (const word of left) {
    const index = unmatched.indexOf(word)
    if (index >= 0) unmatched.splice(index, 1)
    else missing.push(word)
  }
  if (!missing.length) return true
  // At most one spelling correction; numeric identifiers are never corrected.
  return missing.length === 1 && unmatched.length === 1 &&
    missing[0].length >= 5 && unmatched[0].length >= 5 &&
    !/\d/.test(missing[0] + unmatched[0]) && distance(missing[0], unmatched[0]) === 1
}

export function publicVariantSku(product: any, variant: any): string {
  return product.metadata?.catalog_skus?.[variant.sku] || variant.sku || ""
}

export function vendorInventorySku(vendorId: string, sku: string): string {
  return `OWEG-OFFER-${createHash("sha256").update(`${vendorId}\0${normalizeCatalogSku(sku)}`).digest("hex")}`
}

export class CatalogConflict extends Error {}

export function selectCatalogMatch(products: any[], title: string, brand: string, sku: string, vendorId: string, excludeId?: string): any | undefined {
  const matches = products.filter(p => p.id !== excludeId && p.variants?.some((v: any) =>
    normalizeCatalogSku(publicVariantSku(p, v)) === normalizeCatalogSku(sku)))
  for (const product of matches) {
    if (!sameCatalogName(title, product.title) || words(brand).join(" ") !== words(product.metadata?.brand || product.collection?.title || "UNBRANDED").join(" "))
      throw new CatalogConflict(`SKU "${sku}" belongs to "${product.title}". A different product cannot use it.`)
    if (product.metadata?.vendor_id === vendorId)
      throw new CatalogConflict(`You already have an offer for SKU "${sku}". Update its price or stock instead.`)
  }
  return matches[0]
}

/** Locks across processes; workflows use their own connections, so only the lock is transactional. */
export async function withCatalogLock<T>(_scope: any, action: () => Promise<T>): Promise<T> {
  // Keep waiting lock connections out of Medusa's workflow/link pool.
  const client = await getSharedDbPool().connect()
  try {
    await client.query("BEGIN")
    await client.query("select pg_advisory_xact_lock(17291, 84122)")
    const result = await action()
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally { client.release() }
}

export async function readCatalog(scope: any): Promise<any[]> {
  const { data } = await scope.resolve("query").graph({
    entity: "product", fields: ["id", "title", "metadata", "collection.title", "variants.id", "variants.sku", "variants.options.value", "variants.options.option.title"],
  })
  return data || []
}

export async function prepareCatalogOffer(scope: any, vendorId: string, body: any) {
  const catalog = await readCatalog(scope)
  const skus: Record<string, string> = {}
  const seen = new Set<string>()
  let source: any
  const variants = (body.variants || []).map((variant: any) => {
    const sku = normalizeCatalogSku(variant.sku)
    if (!sku) return variant
    if (sku.startsWith("OWEG-OFFER-")) throw new CatalogConflict("Use the catalog SKU, not an internal inventory identifier.")
    if (seen.has(sku)) throw new CatalogConflict(`SKU "${sku}" appears on multiple variants.`)
    seen.add(sku)
    const match = selectCatalogMatch(catalog, body.title, body.metadata?.brand || "UNBRANDED", sku, vendorId)
    if (!match) return { ...variant, sku }
    const canonicalId = match.metadata?.catalog_product_id || match.id
    if (source && (source.metadata?.catalog_product_id || source.id) !== canonicalId)
      throw new CatalogConflict("All shared SKUs must belong to the same catalog product.")
    source = match
    const existing = match.variants.find((v: any) => normalizeCatalogSku(publicVariantSku(match, v)) === sku)
    const optionKey = (values: Record<string, string>) => Object.entries(values).filter(([key]) => !(["default", "default option"].includes(words(key).join(" ")) && words(values[key]).join(" ") === "default")).map(([key, value]) => `${words(key).join(" ")}:${words(value).join(" ")}`).sort().join("|")
    const expectedOptions = Object.fromEntries((existing.options || []).map((o: any) => [o.option?.title, o.value]))
    // A simple product is represented by Medusa's implicit Default option.
    if (optionKey(variant.options || {}) !== optionKey(expectedOptions))
      throw new CatalogConflict(`SKU "${sku}" has different variant options. Use the shared product's original options.`)
    const internal = vendorInventorySku(vendorId, sku)
    skus[internal] = sku
    return { ...variant, sku: internal }
  })
  if (source && variants.some((v: any) => !skus[v.sku]))
    throw new CatalogConflict("A shared offer must use existing catalog SKUs for every variant.")
  return { variants, metadata: { ...(source ? { catalog_product_id: source.metadata?.catalog_product_id || source.id } : {}), catalog_skus: skus }, source }
}

export async function protectCatalogEdit(scope: any, product: any, body: any) {
  const catalog = await readCatalog(scope)
  const current = catalog.find(p => p.id === product.id)
  if (!current) throw new CatalogConflict("Product no longer exists.")
  const identity = product.metadata?.catalog_product_id || product.id
  const linked = !!product.metadata?.catalog_product_id || catalog.some(p => p.id !== product.id && p.metadata?.catalog_product_id === identity)
  if (linked && ((body.title && body.title !== product.title) || (body.metadata?.brand && body.metadata.brand !== product.metadata?.brand)))
    throw new CatalogConflict("Shared catalog identity cannot be changed on an individual offer. Ask the admin to update the catalog product.")
  if (Array.isArray(body.variants)) {
    for (const variant of body.variants) {
      const stored = current.variants.find((v: any) => v.id === variant.id)
      if (linked) {
        // Preserve variant identities/options while allowing vendor price and stock changes.
        if (!stored || (variant.sku != null && normalizeCatalogSku(variant.sku) !== normalizeCatalogSku(publicVariantSku(current, stored)) && variant.sku !== stored.sku))
          throw new CatalogConflict("Shared offer SKUs cannot be changed. Update price or stock instead.")
        const incoming = variant.options || variant.option_values
        const existingOptions = Object.fromEntries((stored.options || []).map((o: any) => [o.option?.title, o.value]))
        if (incoming && JSON.stringify(Object.entries(incoming).sort()) !== JSON.stringify(Object.entries(existingOptions).sort()))
          throw new CatalogConflict("Shared offer variant options cannot be changed.")
        variant.sku = stored.sku
      } else if (variant.sku) {
        if (normalizeCatalogSku(variant.sku).startsWith("OWEG-OFFER-")) throw new CatalogConflict("Use a catalog SKU, not an internal inventory identifier.")
        const match = selectCatalogMatch(catalog, body.title || product.title, body.metadata?.brand || product.metadata?.brand || "UNBRANDED", variant.sku, product.metadata?.vendor_id, product.id)
        if (match) throw new CatalogConflict("This SKU already belongs to a catalog product. Create a shared offer for that product instead.")
      }
    }
    if (linked && body.options && body.variants.length !== current.variants.length)
      throw new CatalogConflict("Shared offer variants cannot be added or removed.")
  }
  return current
}

/** Client cannot choose catalog/owner/approval metadata. */
export function cleanVendorMetadata(metadata: any): Record<string, any> {
  const result = { ...(metadata || {}) }
  for (const key of Object.keys(result)) {
    if (/^(catalog_|vendor_id$|approval_status$|approved_|rejected_|submitted_at$)/.test(key)) delete result[key]
  }
  return result
}

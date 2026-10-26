import {
  CatalogConflict, normalizeCatalogSku, publicVariantSku, readCatalog,
  vendorInventorySku,
} from "./catalog-identity"

type Option = { title: string; values?: Array<string | { value: string }> }
type Variant = { id?: string; sku?: string; title?: string; prices?: Array<{ amount?: number; price_list_id?: string }>; inventory_quantity?: number; options?: Record<string, string> | Array<{ value: string; option?: { title?: string } }> }
type Product = { id: string; title: string; status?: string; metadata?: Record<string, any>; variants?: Variant[]; options?: Option[] }
export type CatalogVariantRequest = { sku: string; options: Record<string, string>; status: "pending" | "approved" }
const normalized = (value: unknown) => String(value || "").normalize("NFKC").trim().toLowerCase()
const family = (product: Product) => String(product.metadata?.catalog_product_id || product.id)
const approved = (product: Product) => product.status === "published" && product.metadata?.approval_status !== "pending" && product.metadata?.approval_status !== "rejected"
export function catalogVariantOptions(variant: Variant): Record<string, string> {
  return Array.isArray(variant.options)
    ? Object.fromEntries(variant.options.map(o => [o.option?.title || "", o.value]).filter(([key]) => key))
    : { ...(variant.options || {}) }
}
export function catalogVariantKey(options: Record<string, string>): string {
  return Object.entries(options).filter(([key, value]) => !(["default", "default option"].includes(normalized(key)) && normalized(value) === "default"))
    .map(([key, value]) => [normalized(key), normalized(value)]).sort(([a], [b]) => a.localeCompare(b)).map(pair => JSON.stringify(pair)).join("|")
}
function sameFamily(a: Product, b: Product) { return family(a) === family(b) }

/** Approved offers contribute catalog variants, never another vendor's stock or prices. */
export function mergeApprovedCatalogVariants(source: Product, catalog: Product[]): Product {
  const variants = [...(source.variants || [])]
  const keys = new Set(variants.map(v => catalogVariantKey(catalogVariantOptions(v))))
  for (const product of catalog) {
    if (product.id === source.id || !sameFamily(source, product) || !approved(product)) continue
    for (const variant of product.variants || []) {
      const options = catalogVariantOptions(variant), key = catalogVariantKey(options)
      if (keys.has(key)) continue
      const sku = publicVariantSku(product, variant)
      if (!sku) continue
      // Project only public identity. Do not copy prices, quantities or inventory links.
      variants.push({ sku, title: variant.title, options: Object.entries(options).map(([title, value]) => ({ value, option: { title } })) })
      keys.add(key)
    }
  }
  const options = (source.options || []).map(option => {
    const existing = (option.values || []).map(value => typeof value === "string" ? value : value.value)
    const added = variants.map(v => catalogVariantOptions(v)[option.title]).filter(Boolean)
    return { ...option, values: Array.from(new Set([...existing, ...added])).map(value => ({ value })) }
  })
  return { ...source, variants, options }
}

/** Shared offers may propose new combinations; the entire new listing stays in review. */
export async function prepareSharedCatalogOffer(scope: any, vendorId: string, body: any, source: Product) {
  const catalog: Product[] = await readCatalog(scope)
  const canonical = family(source)
  const optionNames = (source.options || []).map(o => o.title).filter(name => !["default", "default option"].includes(normalized(name)))
  const available = mergeApprovedCatalogVariants(source, catalog)
  const known = available.variants || []
  const requests: CatalogVariantRequest[] = [], skus: Record<string, string> = {}
  const seenSkus = new Set<string>(), seenOptions = new Set<string>()
  const variants = (body.variants || []).map((variant: Variant) => {
    const sku = normalizeCatalogSku(variant.sku), options = catalogVariantOptions(variant), key = catalogVariantKey(options)
    if (!sku || sku.startsWith("OWEG-OFFER-")) throw new CatalogConflict("Every shared variant needs its public catalog SKU.")
    if (seenSkus.has(sku) || seenOptions.has(key)) throw new CatalogConflict("Each variant needs a unique SKU and option combination.")
    seenSkus.add(sku); seenOptions.add(key)
    if (Object.keys(options).some(name => !optionNames.includes(name)) || optionNames.some(name => !String(options[name] || "").trim()))
      throw new CatalogConflict("Complete the shared product's original option fields for every variant.")
    const matchingCombination = known.find(v => catalogVariantKey(catalogVariantOptions(v)) === key)
    if (matchingCombination && normalizeCatalogSku(publicVariantSku(source, matchingCombination)) !== sku)
      throw new CatalogConflict(`This combination already exists. Use SKU "${publicVariantSku(source, matchingCombination)}" instead.`)
    const matchingSku = known.find(v => normalizeCatalogSku(publicVariantSku(source, v)) === sku)
    if (matchingSku && catalogVariantKey(catalogVariantOptions(matchingSku)) !== key)
      throw new CatalogConflict(`SKU "${sku}" already belongs to a different option combination.`)
    for (const product of catalog) {
      for (const existing of product.variants || []) {
        const existingSku = normalizeCatalogSku(publicVariantSku(product, existing))
        if (existingSku === sku && !sameFamily(source, product)) throw new CatalogConflict(`SKU "${sku}" belongs to another catalog product.`)
        if (existingSku === sku && product.metadata?.vendor_id === vendorId) throw new CatalogConflict(`You already have an offer for SKU "${sku}". Update its price or stock instead.`)
        if (sameFamily(source, product) && product.metadata?.approval_status === "pending" &&
          (existingSku === sku || catalogVariantKey(catalogVariantOptions(existing)) === key) && !matchingCombination)
          throw new CatalogConflict("This new variant is already awaiting admin review. Wait for that review before adding another request.")
      }
    }
    if (!matchingCombination) {
      if (!optionNames.length || optionNames.every(name => ["default", "default option"].includes(normalized(name))))
        throw new CatalogConflict("This product has no variant options. Ask the admin to define its options first.")
      if (!variant.prices?.some(price => !price.price_list_id && Number.isFinite(Number(price.amount)) && Number(price.amount) > 0))
        throw new CatalogConflict(`Set an MRP greater than zero for new SKU "${sku}" before submitting for review.`)
      if (variant.inventory_quantity != null && (!Number.isInteger(variant.inventory_quantity) || variant.inventory_quantity < 0))
        throw new CatalogConflict(`Stock for new SKU "${sku}" must be a non-negative whole number.`)
      requests.push({ sku, options, status: "pending" })
    }
    const internal = vendorInventorySku(vendorId, sku)
    skus[internal] = sku
    return { ...variant, sku: internal, options }
  })
  if (!variants.length) throw new CatalogConflict("Add at least one variant before submitting.")
  return { variants, source, metadata: { catalog_product_id: canonical, catalog_skus: skus, ...(requests.length ? { catalog_variant_requests: requests } : {}) } }
}

/** Recheck identity while the same catalog lock is held during admin approval. */
export async function reviewCatalogVariantRequests(scope: any, product: Product): Promise<CatalogVariantRequest[]> {
  const requests = product.metadata?.catalog_variant_requests as CatalogVariantRequest[] | undefined
  if (!requests?.length) return []
  const catalog: Product[] = await readCatalog(scope)
  const current = catalog.find(p => p.id === product.id)
  if (!current) throw new CatalogConflict("The submitted listing no longer exists.")
  for (const request of requests) {
    const key = catalogVariantKey(request.options)
    if (!(current.variants || []).some(v => normalizeCatalogSku(publicVariantSku(current, v)) === request.sku && catalogVariantKey(catalogVariantOptions(v)) === key))
      throw new CatalogConflict("The requested variant changed. Reopen and review this listing before approval.")
    for (const other of catalog) {
      if (other.id === current.id) continue
      for (const variant of other.variants || []) {
        const sku = normalizeCatalogSku(publicVariantSku(other, variant))
        if (sku === request.sku && (!sameFamily(current, other) || catalogVariantKey(catalogVariantOptions(variant)) !== key))
          throw new CatalogConflict(`Requested SKU "${request.sku}" now conflicts with another product or combination.`)
        if (sameFamily(current, other) && approved(other) && catalogVariantKey(catalogVariantOptions(variant)) === key && sku !== request.sku)
          throw new CatalogConflict(`This combination was already approved as "${sku}". Use the existing catalog variant.`)
      }
    }
  }
  return requests.map(request => ({ ...request, status: "approved" }))
}

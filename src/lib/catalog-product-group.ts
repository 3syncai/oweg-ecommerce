import type { DetailedProduct } from "./medusa"
import { isVariantPurchasable } from "./stock-availability"

type Card = {
  id: string | number
  catalog_product_id?: string
  price: number
  mrp: number
  discount: number
  image: string
  name: string
  handle?: string
  inventory_quantity?: number
  variant_id?: string
}

/** One customer-facing card per catalog identity, priced from its cheapest in-stock offer. */
export function groupCatalogProductCards<T extends Card>(cards: T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const card of cards) {
    const id = card.catalog_product_id || String(card.id)
    const group = groups.get(id) || []
    group.push(card)
    groups.set(id, group)
  }
  return Array.from(groups, ([catalogId, group]) => {
    const canonicalListing = group.find(card => String(card.id) === catalogId)
    const canonical = canonicalListing || group[0]
    const lowest = [...group].sort((a, b) => a.price - b.price || (b.inventory_quantity || 0) - (a.inventory_quantity || 0))[0]
    return {
      ...canonical,
      id: catalogId,
      handle: canonicalListing?.handle,
      price: lowest.price,
      mrp: lowest.mrp,
      discount: lowest.discount,
      variant_id: lowest.variant_id,
      inventory_quantity: lowest.inventory_quantity,
      image: canonical.image === "/oweg_logo.png" ? lowest.image : canonical.image,
    } as T
  })
}

const normalized = (value: string) => value.trim().toLocaleLowerCase()
const isDefault = (title: string, value: string) =>
  ["default", "default option"].includes(normalized(title)) && normalized(value) === "default"
const available = isVariantPurchasable

/** Combine the size/colour matrix across every approved seller listing. */
export function mergeCatalogProductDetails(products: DetailedProduct[], catalogId: string): DetailedProduct {
  const base = products.find(product => product.id === catalogId) || products[0]
  if (!base) throw new Error("Catalog product missing")

  const optionNames = new Map<string, string>()
  const optionValues = new Map<string, Map<string, string>>()
  for (const product of products) {
    for (const variant of product.variants) {
      for (const [title, value] of Object.entries(variant.options)) {
        if (isDefault(title, value)) continue
        const key = normalized(title)
        if (!optionNames.has(key)) optionNames.set(key, title)
        const values = optionValues.get(key) || new Map<string, string>()
        if (!values.has(normalized(value))) values.set(normalized(value), value)
        optionValues.set(key, values)
      }
    }
  }

  const variantsByOptions = new Map<string, DetailedProduct["variants"]>()
  for (const product of products) {
    for (const variant of product.variants) {
      const options = Object.fromEntries(Object.entries(variant.options)
        .filter(([title, value]) => !isDefault(title, value))
        .map(([title, value]) => [optionNames.get(normalized(title)) || title, optionValues.get(normalized(title))?.get(normalized(value)) || value]))
      const key = Object.entries(options).map(([title, value]) => `${normalized(title)}:${normalized(value)}`).sort().join("|")
      const group = variantsByOptions.get(key) || []
      group.push({ ...variant, options })
      variantsByOptions.set(key, group)
    }
  }

  const variants = Array.from(variantsByOptions.values(), group => [...group].sort((a, b) =>
    Number(available(b)) - Number(available(a)) || a.price - b.price || (b.inventory_quantity || 0) - (a.inventory_quantity || 0))[0])
  const best = [...variants].filter(available).sort((a, b) => a.price - b.price || (b.inventory_quantity || 0) - (a.inventory_quantity || 0))[0]
    || [...variants].sort((a, b) => a.price - b.price)[0]
  const options = Array.from(optionNames, ([key, title]) => ({
    id: base.options.find(option => normalized(option.title) === key)?.id || key,
    title,
    values: Array.from(optionValues.get(key)?.values() || []),
  }))
  const colorImages = Object.assign({}, ...products.map(product => product.colorImages || {})) as Record<string, string[]>

  return {
    ...base,
    id: catalogId,
    options,
    variants,
    variant_id: best?.id || base.variant_id,
    price: best?.price ?? base.price,
    mrp: best?.mrp ?? base.mrp,
    discount: best?.discount ?? base.discount,
    colorImages,
  }
}

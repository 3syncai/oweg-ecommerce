import { fetchProductsByIds, toDetailedProduct } from "./medusa"

export function lowestFlashSalePricing(variants: Array<{ id: string; price: number; mrp: number; inventory_quantity?: number }>, saleVariantId?: string, salePrice?: number) {
  const offers = variants.filter(v => typeof v.inventory_quantity === 'number' && v.inventory_quantity > 0)
    .map(v => ({ ...v, price: v.id === saleVariantId && Number(salePrice) > 0 ? Math.min(v.price, Number(salePrice)) : v.price }))
    .filter(v => Number.isFinite(v.price) && v.price > 0)
    .sort((a, b) => a.price - b.price)
  const lowest = offers[0]
  return lowest ? { variant_id: lowest.id, price: lowest.price, mrp: Math.max(lowest.price, lowest.mrp), from: variants.length > 1 } : undefined
}

type FlashProduct = { id: string; variant_id?: string; flash_sale_price?: number }
type FlashData = {
  active?: boolean
  products?: FlashProduct[]
  flash_sale?: Record<string, unknown> | null
}

export async function inStockHomeFlashSale(data: FlashData, options: { all?: boolean } = {}) {
  const source = Array.isArray(data.products) ? (options.all ? data.products : data.products.slice(0, 60)) : []
  if (!data.active || !source.length) return { ...data, active: false, products: [] }
  const ids = [...new Set(source.map(product => product.id))]
  const current = []
  // The public catalogue lookup is capped at 60 IDs. Keep each request bounded,
  // but do not silently drop later deals on the full sale page.
  for (let offset = 0; offset < ids.length; offset += 60) {
    current.push(...await fetchProductsByIds(ids.slice(offset, offset + 60)))
  }
  const stockedVariants = new Set(current.flatMap(product => (product.variants || [])
    .filter(variant => typeof variant.inventory_quantity === "number" && variant.inventory_quantity > 0)
    .map(variant => variant.id)))
  const products = source.filter(product => product.variant_id && stockedVariants.has(product.variant_id)
    && Number.isFinite(Number(product.flash_sale_price)) && Number(product.flash_sale_price) > 0)
  const currentById = new Map(current.map(product => [product.id, product]))
  const enriched = products.map(product => {
    const catalog = currentById.get(product.id)
    if (!catalog) return product
    const variants = toDetailedProduct(catalog).variants
    return { ...product, variants: catalog.variants, display_pricing: lowestFlashSalePricing(variants, product.variant_id, product.flash_sale_price) }
  })
  return { ...data, products: enriched, active: products.length > 0,
    flash_sale: data.flash_sale ? { ...data.flash_sale, item_count: products.length } : null }
}

import { fetchProductsByIds } from "./medusa"

type FlashProduct = { id: string; variant_id?: string; flash_sale_price?: number }
type FlashData = {
  active?: boolean
  products?: FlashProduct[]
  flash_sale?: Record<string, unknown> | null
}

export async function inStockHomeFlashSale(data: FlashData) {
  const source = Array.isArray(data.products) ? data.products.slice(0, 60) : []
  if (!data.active || !source.length) return { ...data, active: false, products: [] }
  const current = await fetchProductsByIds(source.map(product => product.id))
  const stockedVariants = new Set(current.flatMap(product => (product.variants || [])
    .filter(variant => typeof variant.inventory_quantity === "number" && variant.inventory_quantity > 0)
    .map(variant => variant.id)))
  const products = source.filter(product => product.variant_id && stockedVariants.has(product.variant_id)
    && Number.isFinite(Number(product.flash_sale_price)) && Number(product.flash_sale_price) > 0)
  return { ...data, products, active: products.length > 0,
    flash_sale: data.flash_sale ? { ...data.flash_sale, item_count: products.length } : null }
}

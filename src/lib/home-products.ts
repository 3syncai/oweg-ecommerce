import { toUiProduct, type MedusaProduct } from "./medusa"
import { groupCatalogProductCards } from "./catalog-product-group"

export type HomeProduct = ReturnType<typeof toUiProduct>
export const homeProductKey = (product: { id: string | number; catalog_product_id?: string }) =>
  product.catalog_product_id || String(product.id)

/** Home merchandising requires physical stock, even for backorder/unmanaged variants. */
export function toInStockHomeProduct(product: MedusaProduct): HomeProduct | null {
  const variants = product.variants?.filter(variant =>
    typeof variant.inventory_quantity === "number" && variant.inventory_quantity > 0) || []
  if (!variants.length) return null
  const card = toUiProduct({ ...product, variants })
  return card.variant_id && Number.isFinite(card.price) && card.price > 0 ? card : null
}

export function inStockHomeProducts(products: MedusaProduct[]): HomeProduct[] {
  return groupCatalogProductCards(products.map(toInStockHomeProduct).filter((product): product is HomeProduct => Boolean(product)))
}

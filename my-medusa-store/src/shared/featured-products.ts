export const featuredProductsPageSize = 16

export function isFeaturedProductsCursor(value: string): boolean {
  return /^[a-f0-9-]{36}:[1-9][0-9]{0,8}$/i.test(value)
}

export type FeaturedProductsConfig = {
  title: string
  product_ids: string[]
}

export function parseFeaturedProducts(value: unknown): FeaturedProductsConfig | null {
  if (!value || typeof value !== "object") return null
  const { title, product_ids } = value as Record<string, unknown>
  if (typeof title !== "string" || !Array.isArray(product_ids)) return null
  const heading = title.trim()
  if (!heading || heading.length > 80) return null
  if (!product_ids.every(id => typeof id === "string" && /^prod_[a-zA-Z0-9_-]{1,100}$/.test(id))) return null
  if (new Set(product_ids).size !== product_ids.length) return null
  return { title: heading, product_ids }
}
export type FeaturedPickerProduct = {
  id: string
  title: string
  status: string
  thumbnail: string | null
  vendor: string | null
  mrp: number | null
  selling_price: number | null
  has_mrp_range: boolean
  has_selling_price_range: boolean
}

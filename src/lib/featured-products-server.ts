import { unstable_cache } from "next/cache"
import { fetchFeaturedProductsConfig, fetchProductsByIds } from "./medusa"
import { homeProductKey, toInStockHomeProduct, type HomeProduct } from "./home-products"

const refreshSeconds = 30

const readSnapshot = unstable_cache(async (cursor: string) => {
  const config = await fetchFeaturedProductsConfig(cursor)
  if (!config?.product_ids.length) return null
  const ids = config.product_ids

  const catalog = new Map((await fetchProductsByIds(ids)).map(product => [product.id, product]))
  const seen = new Set<string>()
  const products: HomeProduct[] = []
  for (const id of ids) {
    const product = catalog.get(id)
    const card = product && toInStockHomeProduct(product)
    if (!product || !card) continue
    const key = homeProductKey(card)
    if (seen.has(key)) continue
    seen.add(key)
    products.push({ ...card, variant_count: product.variants?.length, limitedDeal: false })
  }

  return cursor || products.length || config.nextCursor ? { title: config.title, products, nextCursor: config.nextCursor } : null
}, ["home-featured-products-v2"], { revalidate: refreshSeconds, tags: ["catalogue"] })

const pending = new Map<string, ReturnType<typeof readSnapshot>>()
let initialRetryAfter = 0

export function loadFeaturedProductsPage(cursor = "") {
  const inFlight = pending.get(cursor)
  if (inFlight) return inFlight
  const request = readSnapshot(cursor).finally(() => { pending.delete(cursor) })
  pending.set(cursor, request)
  return request
}

export async function loadFeaturedProducts() {
  if (Date.now() < initialRetryAfter) return null
  try {
    return await loadFeaturedProductsPage()
  } catch (error) {
    initialRetryAfter = Date.now() + 5_000
    console.warn("[featured-products] Homepage refresh failed", error instanceof Error ? error.name : "Unknown error")
    return null
  }
}

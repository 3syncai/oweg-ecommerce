import { searchProducts } from "./medusa"
import { inStockHomeProducts, homeProductKey, type HomeProduct } from "./home-products"

export type HomeDiscoveryPage = { products: HomeProduct[]; nextOffset: number | null }
const PAGE_SIZE = 24
const SCAN_SIZE = 48
const MAX_SCAN_BATCHES = 2
const TTL = 60_000
const cache = new Map<number, { expires: number; value: HomeDiscoveryPage }>()
const pending = new Map<number, Promise<HomeDiscoveryPage>>()

export async function buildHomeDiscoveryPage(offset: number): Promise<HomeDiscoveryPage> {
  const products: HomeProduct[] = []
  const seen = new Set<string>()
  let cursor = offset
  let more = false
  for (let batch = 0; batch < MAX_SCAN_BATCHES; batch++) {
    const result = await searchProducts({ q: "", limit: SCAN_SIZE, offset: cursor })
    if (!result.products.length) { more = false; break }
    for (const product of result.products) {
      cursor++
      const card = inStockHomeProducts([product])[0]
      if (card && !seen.has(homeProductKey(card))) {
        products.push(card)
        seen.add(homeProductKey(card))
      }
      if (products.length >= PAGE_SIZE) break
    }
    more = cursor < result.count
    if (products.length >= PAGE_SIZE || !more) break
  }
  return { products, nextOffset: more ? cursor : null }
}

export async function getHomeDiscoveryPage(offset: number): Promise<HomeDiscoveryPage> {
  const cached = cache.get(offset)
  if (cached && cached.expires > Date.now()) return cached.value
  const existing = pending.get(offset)
  if (existing) return existing
  const request = buildHomeDiscoveryPage(offset).then(value => {
    if (cache.size >= 32) cache.delete(cache.keys().next().value!)
    cache.set(offset, { value, expires: Date.now() + TTL })
    return value
  }).finally(() => pending.delete(offset))
  pending.set(offset, request)
  return request
}

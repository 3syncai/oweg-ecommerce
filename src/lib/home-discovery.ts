import { unstable_cache } from "next/cache"
import { fetchDiscoveryProducts } from "./medusa"
import { inStockHomeProducts, homeProductKey, type HomeProduct } from "./home-products"

export type HomeDiscoveryPage = { products: HomeProduct[]; nextOffset: number | null }
const PAGE_SIZE = 24
const SCAN_SIZE = 48
const MAX_SCAN_BATCHES = 2
const MAX_PAGE_AGE_MS = 60_000
const MAX_SHARED_OFFSET = 240
const MAX_CONCURRENT_LOADS = 4
type DiscoveryEntry = { page: HomeDiscoveryPage; expiresAt: number }
const pending = new Map<number, Promise<DiscoveryEntry>>()

export async function buildHomeDiscoveryPage(offset: number): Promise<HomeDiscoveryPage> {
  const products: HomeProduct[] = []
  const seen = new Set<string>()
  let cursor = offset
  let more = false
  for (let batch = 0; batch < MAX_SCAN_BATCHES; batch++) {
    const result = await fetchDiscoveryProducts(cursor, SCAN_SIZE)
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

async function loadDiscoveryPage(offset: number): Promise<DiscoveryEntry> {
  const existing = pending.get(offset)
  if (existing) return existing
  if (pending.size >= MAX_CONCURRENT_LOADS) throw new Error("Discovery is busy")
  const start = Date.now()
  const request = buildHomeDiscoveryPage(offset).then(page => {
    console.info("[home-discovery] rebuilt", { offset, cards: page.products.length, durationMs: Date.now() - start })
    return { page, expiresAt: start + MAX_PAGE_AGE_MS }
  }).finally(() => pending.delete(offset))
  pending.set(offset, request)
  return request
}

const readSharedPage = unstable_cache(loadDiscoveryPage, ["home-discovery-cards-v1"], {
  revalidate: 30,
  tags: ["catalogue"],
})

export async function getHomeDiscoveryPage(offset: number): Promise<DiscoveryEntry> {
  // Keep the persistent cache bounded even when a caller requests arbitrary offsets.
  if (offset > MAX_SHARED_OFFSET) return loadDiscoveryPage(offset)
  const entry = await readSharedPage(offset)
  // Next can return a stale entry while refreshing it. At the hard deadline,
  // await the same bounded rebuild instead of serving the expired entry.
  return entry.expiresAt > Date.now() ? entry : loadDiscoveryPage(offset)
}

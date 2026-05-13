/**
 * Tiny TTL cache used by the customer-affiliate read endpoints.
 *
 * Why this exists:
 *   `/api/customer-affiliate/me` is hit on almost every page view by signed-in
 *   customers. The result rarely changes — once a user becomes an affiliate
 *   their `refer_code`/coins update only when they earn or register. Hitting
 *   Postgres on every page load is waste.
 *
 * What this is:
 *   - A `Map<string, { value, expires }>` stored on `globalThis` so it survives
 *     between requests on a warm Lambda.
 *   - Per-Lambda — not cross-instance. Cache hit rate scales with how warm
 *     each Lambda stays. This is GOOD ENOUGH; for cross-Lambda caching you'd
 *     want Vercel Runtime Cache or Upstash Redis.
 *   - Capped size + TTL prevents memory growth on long-running Lambdas.
 *
 * What this is NOT:
 *   - A correctness layer. Always invalidate via `invalidate(key)` on any write
 *     that mutates the value (e.g. when a customer registers as an affiliate).
 */

type CacheEntry<T> = {
  value: T
  expires: number
}

const MAX_ENTRIES = 5_000

type GlobalWithCache = typeof globalThis & {
  __oweg_affiliate_cache?: Map<string, CacheEntry<unknown>>
}
const g = globalThis as GlobalWithCache

const store = (): Map<string, CacheEntry<unknown>> => {
  if (!g.__oweg_affiliate_cache) {
    g.__oweg_affiliate_cache = new Map()
  }
  return g.__oweg_affiliate_cache
}

export function cacheGet<T>(key: string): T | undefined {
  const m = store()
  const entry = m.get(key) as CacheEntry<T> | undefined
  if (!entry) return undefined
  if (entry.expires < Date.now()) {
    m.delete(key)
    return undefined
  }
  return entry.value
}

export function cacheSet<T>(key: string, value: T, ttlSeconds: number): void {
  const m = store()

  // Evict oldest entries if we're at capacity. Maps preserve insertion order,
  // so deleting the first key removes the oldest.
  if (m.size >= MAX_ENTRIES) {
    const firstKey = m.keys().next().value
    if (firstKey !== undefined) m.delete(firstKey)
  }

  m.set(key, { value, expires: Date.now() + ttlSeconds * 1000 })
}

export function invalidate(key: string): void {
  store().delete(key)
}

export function invalidatePrefix(prefix: string): void {
  const m = store()
  for (const key of m.keys()) {
    if (key.startsWith(prefix)) m.delete(key)
  }
}

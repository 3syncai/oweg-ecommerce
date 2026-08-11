/**
 * In-memory page cache so client navigations don't flash the full-page spinner.
 * Cleared on logout and when vendor data is invalidated.
 */

type CacheEntry = {
  data: unknown
  updatedAt: number
}

const store = new Map<string, CacheEntry>()

export function peekPageCache<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  return entry.data as T
}

export function hasPageCache(key: string): boolean {
  return store.has(key)
}

export function writePageCache<T>(key: string, data: T): void {
  store.set(key, { data, updatedAt: Date.now() })
}

export function clearPageCache(prefix?: string): void {
  if (!prefix) {
    store.clear()
    return
  }
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(prefix)) {
      store.delete(key)
    }
  }
}

/** Build a stable cache key from route + query parts. */
export function pageCacheKey(route: string, parts?: Record<string, string | number | undefined | null>) {
  if (!parts) return route
  const qs = Object.entries(parts)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("&")
  return qs ? `${route}?${qs}` : route
}

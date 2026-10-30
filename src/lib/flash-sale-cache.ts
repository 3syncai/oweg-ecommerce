export type FlashSalePayload = Record<string, unknown> & {
  active?: boolean
  flash_sale?: { expires_at?: string | null } | null
  products?: unknown[]
}

export function currentFlashSale(value: FlashSalePayload, now = Date.now()): FlashSalePayload {
  const expiry = Date.parse(value.flash_sale?.expires_at || "")
  return Number.isFinite(expiry) && expiry <= now
    ? { ...value, active: false, flash_sale: null, products: [] }
    : value
}

/** Coalesce cold-cache bursts; never keep advertising an expired sale. */
export function createFlashSaleCache(now = Date.now) {
  let cached: { value: FlashSalePayload; expires: number } | undefined
  let pending: Promise<FlashSalePayload> | undefined
  return async (load: () => Promise<FlashSalePayload>) => {
    if (cached && cached.expires > now()) return currentFlashSale(cached.value, now())
    if (pending) return pending
    const request = load().then(value => {
      const expiry = Date.parse(value.flash_sale?.expires_at || "")
      cached = { value, expires: Math.min(now() + 30_000, Number.isFinite(expiry) && expiry > now() ? expiry : Infinity) }
      return currentFlashSale(value, now())
    }).finally(() => { if (pending === request) pending = undefined })
    pending = request
    return request
  }
}

export function flashSaleCacheSeconds(value: FlashSalePayload, now = Date.now()) {
  const expiry = Date.parse(value.flash_sale?.expires_at || "")
  return Number.isFinite(expiry) ? Math.max(0, Math.min(15, Math.floor((expiry - now) / 1000))) : 15
}

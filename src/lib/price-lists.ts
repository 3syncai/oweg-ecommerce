// Fetch price list prices for applying discounts
// This fetches the "Special Prices" price list via internal API

const PRICE_LIST_CACHE = new Map<string, { expires: number; prices: Map<string, number> }>()
const PRICE_LIST_TTL_MS = 1000 * 60 * 5 // 5 minutes
const CACHE_KEY = 'special-prices'

export async function getPriceListPrices(): Promise<Map<string, number>> {
  const cached = PRICE_LIST_CACHE.get(CACHE_KEY)
  if (cached && cached.expires > Date.now()) {
    return cached.prices
  }

  try {
    // Use internal API route (server-side, has admin access)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/medusa/price-list`, {
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn('Failed to fetch price list:', res.status)
      return new Map()
    }

    const data = await res.json()
    const priceMap = new Map<string, number>()

    // Map variant_id -> discounted price amount
    for (const priceItem of data.prices || []) {
      if (priceItem.variant_id && typeof priceItem.amount === 'number') {
        priceMap.set(priceItem.variant_id, priceItem.amount)
      }
    }

    PRICE_LIST_CACHE.set(CACHE_KEY, {
      expires: Date.now() + PRICE_LIST_TTL_MS,
      prices: priceMap,
    })

    return priceMap
  } catch (error) {
    console.error('Error fetching price list:', error)
    return new Map()
  }
}

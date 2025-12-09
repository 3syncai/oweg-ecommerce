import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PRICE_LIST_ID = 'pl_1765232034558'
const MEDUSA_URL = process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'

// Simple in-memory cache
let priceListCache: { expires: number; prices: Map<string, number> } | null = null
const CACHE_TTL_MS = 1000 * 60 * 5 // 5 minutes

export async function GET() {
  try {
    // Return cached if available
    if (priceListCache && priceListCache.expires > Date.now()) {
      const pricesArray = Array.from(priceListCache.prices.entries()).map(([variant_id, amount]) => ({
        variant_id,
        amount,
      }))
      return NextResponse.json({ prices: pricesArray })
    }

    // Fetch from Medusa admin with authentication
    const adminApiKey = process.env.MEDUSA_ADMIN_API_KEY || ''
    const authScheme = process.env.MEDUSA_ADMIN_AUTH_SCHEME || 'bearer'
    
    const res = await fetch(`${MEDUSA_URL}/admin/price-lists/${PRICE_LIST_ID}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `${authScheme} ${adminApiKey}`,
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn('Failed to fetch price list from admin API:', res.status)
      return NextResponse.json({ prices: [] })
    }

    const data = await res.json()
    const priceMap = new Map<string, number>()

    // Map variant_id -> discounted price amount
    for (const priceItem of data.price_list?.prices || []) {
      if (priceItem.variant_id && typeof priceItem.amount === 'number') {
        priceMap.set(priceItem.variant_id, priceItem.amount)
      }
    }

    // Cache it
    priceListCache = {
      expires: Date.now() + CACHE_TTL_MS,
      prices: priceMap,
    }

    const pricesArray = Array.from(priceMap.entries()).map(([variant_id, amount]) => ({
      variant_id,
      amount,
    }))

    return NextResponse.json({ prices: pricesArray })
  } catch (error) {
    console.error('Error fetching price list:', error)
    return NextResponse.json({ prices: [] })
  }
}

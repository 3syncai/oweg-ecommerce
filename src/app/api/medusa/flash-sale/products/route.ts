import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { inStockHomeFlashSale } from '@/lib/home-flash-sale'
import { createFlashSaleCache, flashSaleCacheSeconds, type FlashSalePayload } from '@/lib/flash-sale-cache'

const loadCached = createFlashSaleCache()

export async function GET(request: NextRequest) {
  try {
    const data = await loadCached(async () => {
      const backendUrl = process.env.MEDUSA_BACKEND_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
      const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY
      const salesChannelId = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (publishableKey) headers['x-publishable-api-key'] = publishableKey
      if (salesChannelId) headers['x-sales-channel-id'] = salesChannelId
      const response = await axios.get<FlashSalePayload>(`${backendUrl}/store/flash-sale/products`, { headers, timeout: 15000 })
      return response.data
    })
    const homeOnly = request.nextUrl.searchParams.get('in_stock') === '1'
    const result = homeOnly ? await inStockHomeFlashSale(data as Parameters<typeof inStockHomeFlashSale>[0]) : data
    // Public catalog only; customer/vendor credentials are never forwarded.
    return NextResponse.json(result, { headers: { 'Cache-Control': `public, max-age=0, s-maxage=${flashSaleCacheSeconds(data)}` } })
  } catch (error) {
    console.warn('[Flash Sale API] upstream unavailable:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ active: false, flash_sale: null, products: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { inStockHomeFlashSale } from '@/lib/home-flash-sale'

// In-memory cache: 30 minutes TTL
let flashSaleCache: { data: unknown; expires: number } | null = null
const CACHE_TTL_MS = 1000 * 60 * 30 // 30 minutes

export async function GET(request: NextRequest) {
  const homeOnly = request.nextUrl.searchParams.get('in_stock') === '1'
  const respond = async (data: unknown) => NextResponse.json(homeOnly
    ? await inStockHomeFlashSale(data as Parameters<typeof inStockHomeFlashSale>[0])
    : data)
  try {
  // Return cached data if still valid
  if (flashSaleCache && flashSaleCache.expires > Date.now()) {
    return await respond(flashSaleCache.data)
  }
    const backendUrl = process.env.MEDUSA_BACKEND_URL || process.env.BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000'
    const url = `${backendUrl}/store/flash-sale/products`

    // Get publishable key and sales channel ID like other routes
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
      process.env.MEDUSA_PUBLISHABLE_KEY ||
      process.env.MEDUSA_PUBLISHABLE_API_KEY
    const salesChannelId = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID ||
      process.env.MEDUSA_SALES_CHANNEL_ID

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (publishableKey) {
      headers['x-publishable-api-key'] = publishableKey
    }
    if (salesChannelId) {
      headers['x-sales-channel-id'] = salesChannelId
    }

    console.log('[Flash Sale API] Fetching from backend:', url)
    console.log('[Flash Sale API] Headers:', { hasPublishableKey: !!publishableKey, hasSalesChannel: !!salesChannelId })

    const response = await axios.get(url, {
      headers,
      validateStatus: () => true, // Don't throw on any status
    })

    console.log('[Flash Sale API] Backend response status:', response.status, response.statusText)

    if (response.status !== 200) {
      console.error('[Flash Sale API] Backend error:', response.data)
      return NextResponse.json(
        { active: false, flash_sale: null, products: [] },
        { status: 200 } // Return empty instead of error
      )
    }

    const data = response.data
    
    // Cache the result
    flashSaleCache = {
      data,
      expires: Date.now() + CACHE_TTL_MS,
    }
    
    // Reduced logging - only log if there are active flash sales
    if (data.active) {
      console.log('[Flash Sale API] Active flash sale found:', {
        productsCount: data.products?.length || 0,
      })
    }
    
    return await respond(data)
  } catch (error) {
    console.error('[Flash Sale API] Error fetching flash sale products:', error)
    return NextResponse.json(
      { active: false, flash_sale: null, products: [] },
      { status: 200 } // Return empty instead of error
    )
  }
}


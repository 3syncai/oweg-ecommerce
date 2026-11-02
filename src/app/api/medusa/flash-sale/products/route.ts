import { NextRequest, NextResponse } from 'next/server'
import { loadFlashSale } from '@/lib/flash-sale-server'
import { flashSaleCacheSeconds } from '@/lib/flash-sale-cache'

export async function GET(request: NextRequest) {
  try {
    const data = await loadFlashSale({ all: request.nextUrl.searchParams.get('all') === '1', homeOnly: request.nextUrl.searchParams.get('in_stock') === '1' })
    return NextResponse.json(data, { headers: { 'Cache-Control': `public, max-age=0, s-maxage=${flashSaleCacheSeconds(data)}` } })
  } catch {
    return NextResponse.json({ active: false, flash_sale: null, products: [], unavailable: true }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

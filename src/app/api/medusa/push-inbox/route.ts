import { NextRequest, NextResponse } from 'next/server'
import { medusaStoreFetch, appendUpstreamCookies } from '@/lib/medusa-auth'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  try {
    const offset = req.nextUrl.searchParams.get('offset') || '0'
    const upstream = await medusaStoreFetch('/store/push-inbox?offset=' + encodeURIComponent(offset), {
      forwardedCookie: req.headers.get('cookie') || '', cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    const response = NextResponse.json(await upstream.json(), { status: upstream.status, headers: { 'Cache-Control': 'private, no-store' } })
    appendUpstreamCookies(response, upstream)
    return response
  } catch { return NextResponse.json({ error: 'Notifications are temporarily unavailable.' }, { status: 503 }) }
}

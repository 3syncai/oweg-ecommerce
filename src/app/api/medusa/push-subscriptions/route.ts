import { NextRequest, NextResponse } from 'next/server'
import { medusaStoreFetch, appendUpstreamCookies } from '@/lib/medusa-auth'
export const dynamic = 'force-dynamic'
async function proxy(req: NextRequest) {
  // Block cross-origin cookie-backed writes; permission is not consent on its own.
  if (req.method !== 'GET' && req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  try {
    const endpoint = req.nextUrl.searchParams.get('endpoint')
    const provider = req.nextUrl.searchParams.get('provider')
    const query = new URLSearchParams()
    if (endpoint) query.set('endpoint', endpoint)
    if (provider) query.set('provider', provider)
    const qs = query.toString()
    const upstream = await medusaStoreFetch(`/store/push-subscriptions${qs ? `?${qs}` : ''}`, {
      method: req.method, forwardedCookie: req.headers.get('cookie') || '',
      headers: { 'content-type': 'application/json' },
      body: req.method === 'GET' ? undefined : JSON.stringify(await req.json()),
      signal: AbortSignal.timeout(8000), cache: 'no-store',
    })
    const response = NextResponse.json(await upstream.json(), { status: upstream.status, headers: { 'Cache-Control': 'private, no-store' } })
    appendUpstreamCookies(response, upstream)
    return response
  } catch { return NextResponse.json({ error: 'Notifications are temporarily unavailable.' }, { status: 503 }) }
}
export { proxy as GET, proxy as POST, proxy as DELETE }

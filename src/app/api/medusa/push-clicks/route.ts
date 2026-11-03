import { NextRequest, NextResponse } from 'next/server'
import { medusaStoreFetch } from '@/lib/medusa-auth'
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return new NextResponse(null, { status: 403 })
  try {
    const body = await req.json()
    if (typeof body?.token !== 'string' || body.token.length !== 36) return new NextResponse(null, { status: 400 })
    const upstream = await medusaStoreFetch('/store/push-clicks', { method: 'POST', body: JSON.stringify({ token: body.token }), headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(2500) })
    return new NextResponse(null, { status: upstream.ok ? 204 : upstream.status, headers: { 'Cache-Control': 'no-store' } })
  } catch { return new NextResponse(null, { status: 503 }) }
}

import { NextResponse } from 'next/server'
import { medusaStoreFetch } from '@/lib/medusa-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const upstream = await medusaStoreFetch('/store/app-version', {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    return NextResponse.json(await upstream.json(), {
      status: upstream.status,
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  } catch {
    return NextResponse.json({ error: 'App version is temporarily unavailable.' }, { status: 503 })
  }
}

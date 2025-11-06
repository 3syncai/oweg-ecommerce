import { NextResponse } from "next/server"
import { cookies } from "next/headers"

const CART_COOKIE = "cart_id"

async function backend(path: string, init?: RequestInit) {
  const base = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  const pk = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY
  const sc = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID
  if (pk) headers["x-publishable-api-key"] = pk
  if (sc) headers["x-sales-channel-id"] = sc
  return fetch(`${base}${path}`, { cache: "no-store", ...init, headers: { ...headers, ...(init?.headers as HeadersInit) } })
}

export const dynamic = "force-dynamic"

export async function GET() {
  const c = await cookies()
  const cartId = c.get(CART_COOKIE)?.value
  if (cartId) {
    const res = await backend(`/store/carts/${cartId}`)
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data)
    }
  }
  // create
  const created = await backend(`/store/carts`, { method: "POST" })
  if (!created.ok) return NextResponse.json({ error: "failed to create cart" }, { status: 500 })
  const json = await created.json()
  const resp = NextResponse.json(json)
  const newId = json.cart?.id || json.id
  if (newId) resp.cookies.set(CART_COOKIE, newId, { httpOnly: false, sameSite: "lax", path: "/" })
  return resp
}

export async function POST() {
  // alias to create/ensure
  return GET()
}

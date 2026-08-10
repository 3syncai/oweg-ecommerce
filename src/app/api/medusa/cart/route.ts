import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import axios from 'axios'
import { applyFlashSalePricesToCart } from '@/lib/flash-sale-cart-mapper'

const CART_COOKIE = "cart_id"
const GUEST_CART_HEADER = "x-guest-cart-id"
const SALES_CHANNEL_ID =
  process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID
const REGION_ID =
  process.env.NEXT_PUBLIC_MEDUSA_REGION_ID || process.env.MEDUSA_REGION_ID

async function backend(path: string, init?: RequestInit) {
  const base = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  const pk = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY
  const sc = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID
  if (pk) headers["x-publishable-api-key"] = pk
  if (sc) headers["x-sales-channel-id"] = sc
  
  const method = init?.method || 'GET'
  const url = `${base}${path}`
  
  try {
    const response = await axios({
      method: method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch',
      url,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
      data: init?.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : undefined,
      validateStatus: () => true, // Don't throw on any status
    })
    
    // Convert axios response to fetch-like response
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      json: async () => response.data,
      text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
    } as Response
  } catch (error) {
    // Return error response
    return {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: error instanceof Error ? error.message : 'Unknown error' }),
      text: async () => error instanceof Error ? error.message : 'Unknown error',
    } as Response
  }
}

function buildCartCreateBody(): RequestInit["body"] {
  const payload: Record<string, string> = {}
  if (SALES_CHANNEL_ID) payload.sales_channel_id = SALES_CHANNEL_ID
  if (REGION_ID) payload.region_id = REGION_ID
  if (Object.keys(payload).length === 0) return undefined
  return JSON.stringify(payload)
}

function cartLineCount(cart: { items?: unknown[]; line_items?: unknown[] } | null | undefined): number {
  if (!cart) return 0
  const items = cart.items ?? cart.line_items ?? []
  return Array.isArray(items) ? items.length : 0
}

const EMPTY_CART = {
  cart: {
    id: null,
    items: [],
    line_items: [],
  },
}

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const c = await cookies()
  const cookieCartId = c.get(CART_COOKIE)?.value
  let cartId = cookieCartId
  const guestHeader = req.headers.get(GUEST_CART_HEADER) || undefined
  
  // Check for guest cart in request header (from localStorage)
  if (!cartId) {
    cartId = guestHeader
  }

  const ensure = req.nextUrl.searchParams.get("ensure") === "1"
  
  if (cartId) {
    const res = await backend(`/store/carts/${cartId}`)
    if (res.ok) {
      const data = await res.json()
      
      // Skip flash-sale fan-out when cart is empty — shaves ~0.5–1s off shell loads
      if (cartLineCount(data?.cart) > 0) {
        try {
          const flashSaleRes = await backend('/store/flash-sale/products')
          if (flashSaleRes.ok) {
            const flashSaleData = await flashSaleRes.json()
            if (data.cart) {
              data.cart = applyFlashSalePricesToCart(data.cart, flashSaleData)
            }
          }
        } catch (error) {
          console.error('Failed to map flash sale prices in cart:', error)
        }
      }
      
      return NextResponse.json(data)
    }
  }

  // Anonymous shell: do not create a Medusa cart until ensure=1 or add-to-cart
  if (!ensure) {
    return NextResponse.json(EMPTY_CART)
  }

  // create
  const body = buildCartCreateBody()
  const created = await backend(`/store/carts`, {
    method: "POST",
    ...(body ? { body } : {}),
  })
  if (!created.ok) return NextResponse.json({ error: "failed to create cart" }, { status: 500 })
  const json = await created.json()
  const resp = NextResponse.json(json)
  const newId = json.cart?.id || json.id
  if (newId) {
    // Persist both cookie and guestCartId so logged-in and guest clients share one cart.
    const withGuest = NextResponse.json({ ...json, guestCartId: newId })
    withGuest.cookies.set(CART_COOKIE, newId, { httpOnly: false, sameSite: "lax", path: "/" })
    return withGuest
  }
  return resp
}

export async function POST(req: NextRequest) {
  // Ensure cart exists (create if needed)
  const url = req.nextUrl.clone()
  url.searchParams.set("ensure", "1")
  return GET(new NextRequest(url, { headers: req.headers }))
}

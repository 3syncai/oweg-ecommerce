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
      data: init?.body ? (typeof init.body === 'string' ? (() => {
        try {
          return JSON.parse(init.body)
        } catch {
          return init.body
        }
      })() : init.body) : undefined,
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

export const dynamic = "force-dynamic"

type EnsureCartResult = {
  cartId: string
  shouldSetCookie: boolean
}

async function ensureCartId(req: NextRequest): Promise<EnsureCartResult> {
  const c = await cookies()
  let existing = c.get(CART_COOKIE)?.value
  
  // Check for guest cart in request header (from localStorage)
  if (!existing) {
    existing = req.headers.get(GUEST_CART_HEADER) || undefined
  }
  
  if (existing) {
    return { cartId: existing, shouldSetCookie: false }
  }
  const body = buildCartCreateBody()
  const res = await backend(`/store/carts`, {
    method: "POST",
    ...(body ? { body } : {}),
  })
  if (!res.ok) throw new Error("create cart failed")
  const json = await res.json()
  const id = json.cart?.id || json.id
  if (!id) throw new Error("cart id missing from backend")
  return { cartId: id, shouldSetCookie: true }
}

async function createFreshCart(): Promise<string> {
  const body = buildCartCreateBody()
  const res = await backend(`/store/carts`, {
    method: "POST",
    ...(body ? { body } : {}),
  })
  if (!res.ok) throw new Error(`create cart failed: ${res.status}`)
  const json = await res.json()
  const cartId = json.cart?.id || json.id
  if (!cartId) throw new Error("cart id missing from backend")
  return cartId
}

async function addLineItemRequest(cartId: string, body: { variant_id: string; quantity: number }) {
  return backend(`/store/carts/${encodeURIComponent(cartId)}/line-items`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

async function readErrorPayload(res: Response) {
  try {
    return await res.json()
  } catch {
    try {
      return await res.text()
    } catch {
      return null
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const variant_id: string = body.variant_id
    const quantity: number = Number(body.quantity || 1)
    if (!variant_id) return NextResponse.json({ error: "variant_id required" }, { status: 400 })
    let { cartId, shouldSetCookie } = await ensureCartId(req)
    let res = await addLineItemRequest(cartId, { variant_id, quantity })
    let attempts = 0

    // If cart was stale (deleted upstream), create a fresh one and retry once.
    while (!res.ok && res.status === 404 && attempts < 1) {
      try {
        const freshId = await createFreshCart()
        cartId = freshId
        shouldSetCookie = true
        res = await addLineItemRequest(cartId, { variant_id, quantity })
        attempts += 1
      } catch (err) {
        const msg = err instanceof Error ? err.message : "failed to refresh cart"
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }

    if (!res.ok) {
      const errorPayload = await readErrorPayload(res)
      const message =
        (errorPayload && (errorPayload.error || errorPayload.message)) ||
        `add failed: ${res.status}`
      return NextResponse.json({ error: message, details: errorPayload }, { status: res.status })
    }

    const data = await res.json()
    
    // Map cart prices using flash_sale_item table after adding item
    try {
      const flashSaleRes = await backend('/store/flash-sale/products')
      if (flashSaleRes.ok) {
        const flashSaleData = await flashSaleRes.json()
        const cart = data.cart || data
        if (cart) {
          const updatedCart = applyFlashSalePricesToCart(cart, flashSaleData)
          if (data.cart) {
            data.cart = updatedCart
          } else {
            Object.assign(data, updatedCart)
          }
        }
      }
    } catch (error) {
      // If flash sale mapping fails, return cart as-is
      console.error('Failed to map flash sale prices in cart:', error)
    }
    
    const response = NextResponse.json(data)
    const c = await cookies()
    const hasCookie = c.get(CART_COOKIE)?.value
    
    if (shouldSetCookie && hasCookie) {
      // Only set cookie if user is authenticated (has existing cookie)
      response.cookies.set(CART_COOKIE, cartId, { httpOnly: false, sameSite: "lax", path: "/" })
    } else if (shouldSetCookie && !hasCookie) {
      // Guest cart - return cart ID for localStorage
      return NextResponse.json({ ...data, guestCartId: cartId })
    }
    return response
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

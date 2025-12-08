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

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const c = await cookies()
  let cartId = c.get(CART_COOKIE)?.value
  
  // Check for guest cart in request header (from localStorage)
  if (!cartId) {
    cartId = req.headers.get(GUEST_CART_HEADER) || undefined
  }
  
  if (cartId) {
    const res = await backend(`/store/carts/${cartId}`)
    if (res.ok) {
      const data = await res.json()
      
      // Map cart prices using flash_sale_item table
      try {
        const flashSaleRes = await backend('/store/flash-sale/products')
        if (flashSaleRes.ok) {
          const flashSaleData = await flashSaleRes.json()
          if (data.cart) {
            data.cart = applyFlashSalePricesToCart(data.cart, flashSaleData)
          }
        }
      } catch (error) {
        // If flash sale mapping fails, return cart as-is
        console.error('Failed to map flash sale prices in cart:', error)
      }
      
      return NextResponse.json(data)
    }
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
    // If no cookie exists, this is a guest cart - don't set cookie, client will store in localStorage
    const hasCookie = c.get(CART_COOKIE)?.value
    if (!hasCookie) {
      // Return cart ID in response for client to store in localStorage
      return NextResponse.json({ ...json, guestCartId: newId })
    }
    resp.cookies.set(CART_COOKIE, newId, { httpOnly: false, sameSite: "lax", path: "/" })
  }
  return resp
}

export async function POST(req: NextRequest) {
  // alias to create/ensure
  return GET(req)
}

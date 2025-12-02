import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import axios from 'axios'

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
      // Fetch flash sale data to get original prices
      try {
        const flashSaleRes = await backend('/store/flash-sale/products')
        if (flashSaleRes.ok) {
          const flashSaleData = await flashSaleRes.json()
          
          if (flashSaleData.active && flashSaleData.products && Array.isArray(flashSaleData.products)) {
            // Create map: variant_id -> flash_sale_price (discounted price)
            const priceMap = new Map<string, number>()
            flashSaleData.products.forEach((product: { variant_id?: string; flash_sale_price?: number }) => {
              if (product.variant_id && product.flash_sale_price !== undefined) {
                priceMap.set(product.variant_id, product.flash_sale_price)
              }
            })
            
            // Map cart items to use flash_sale_price
            if (data.cart && data.cart.items && Array.isArray(data.cart.items)) {
              data.cart.items = data.cart.items.map((item: { variant?: { id?: string }; variant_id?: string; unit_price?: number; price_set?: { original_amount?: number; calculated_amount?: number; presentment_amount?: number; [key: string]: unknown }; quantity?: number; total?: number; subtotal?: number }) => {
                const variantId = item.variant?.id || item.variant_id
                
                if (!variantId || !priceMap.has(variantId)) {
                  return item
                }
                
                // Product is in flash sale - use flash_sale_price (discounted price) for cart display
                // flash_sale_price is already in rupees (major units), not paise
                const flashSalePrice = priceMap.get(variantId)!
                
                // Check existing price format to match it
                // If existing price is large (> 1000), it's likely in minor units (paise)
                // If existing price is small (< 1000), it's likely in major units (rupees)
                const existingPrice = item.unit_price || item.price_set?.original_amount || 0
                const isMinorUnits = existingPrice > 1000
                
                // Use the same format as existing prices
                const priceToUse = isMinorUnits ? Math.round(flashSalePrice * 100) : flashSalePrice
                
                // Override unit_price
                if (item.unit_price !== undefined) {
                  item.unit_price = priceToUse
                }
                
                // Override price_set if it exists
                if (item.price_set) {
                  item.price_set = {
                    ...item.price_set,
                    original_amount: priceToUse,
                    calculated_amount: priceToUse,
                    presentment_amount: priceToUse,
                  }
                }
                
                // Recalculate line total
                const quantity = item.quantity || 1
                const lineTotal = priceToUse * quantity
                
                if (item.total !== undefined) {
                  item.total = lineTotal
                }
                if (item.subtotal !== undefined) {
                  item.subtotal = lineTotal
                }
                
                return item
              })
              
              // Recalculate cart totals
              const newSubtotal = data.cart.items.reduce((sum: number, item: { total?: number; subtotal?: number }) => {
                return sum + (item.total || item.subtotal || 0)
              }, 0)
              
              data.cart.subtotal = newSubtotal
              data.cart.total = newSubtotal + (data.cart.tax_total || 0) + (data.cart.shipping_total || 0) - (data.cart.discount_total || 0)
            }
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

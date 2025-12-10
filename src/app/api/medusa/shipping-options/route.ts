
import { NextRequest, NextResponse } from "next/server"
import axios from 'axios'

export const dynamic = "force-dynamic"

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
      validateStatus: () => true,
    })
    
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.data,
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      json: async () => ({ error: error instanceof Error ? error.message : 'Unknown error' }),
    }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  let cartId = searchParams.get("cart_id")

  if (!cartId) {
    return NextResponse.json({ error: "Missing cart_id" }, { status: 400 })
  }

  let path = `/store/shipping-options?cart_id=${encodeURIComponent(cartId)}`

  if (cartId === "buy-now") {
    let regionId = process.env.NEXT_PUBLIC_MEDUSA_REGION_ID || process.env.MEDUSA_REGION_ID
    
    // If no configured region, try to fetch the first region from the store
    if (!regionId) {
      try {
        const regionsRes = await backend("/store/regions")
        if (regionsRes.ok) {
           const regionsData = await regionsRes.json() as any
           if (regionsData.regions && regionsData.regions.length > 0) {
             regionId = regionsData.regions[0].id
           }
        }
      } catch (e) {
        console.error("Failed to fetch regions for fallback", e)
      }
    }

    if (regionId) {
       // Create a temporary cart to satisfy `cart_id` requirement
       try {
         const tempCartRes = await backend("/store/carts", {
             method: "POST",
             body: JSON.stringify({ region_id: regionId })
         })
         if (tempCartRes.ok) {
             const tempCartData = await tempCartRes.json() as any
             const tempCartId = (tempCartData.cart?.id || tempCartData.id) as string
             if (tempCartId) {
                 cartId = tempCartId
                 path = `/store/shipping-options?cart_id=${encodeURIComponent(cartId)}`
             }
         } else {
             console.error("Failed to create temp cart", await tempCartRes.json())
         }
       } catch (e) {
          console.error("Failed to create temp cart for shipping options", e)
       }
    } else {
      return NextResponse.json({ error: "Buy Now requires a valid Region (none configured or found)" }, { status: 400 })
    }
  }

  const res = await backend(path)
  const data = await res.json()
  
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  return NextResponse.json(data)
}

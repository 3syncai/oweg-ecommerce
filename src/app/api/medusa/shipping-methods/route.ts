
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { cartId, optionId } = body

  if (!cartId || !optionId) {
    return NextResponse.json({ error: "Missing cartId or optionId" }, { status: 400 })
  }

  const res = await backend(`/store/carts/${encodeURIComponent(cartId)}/shipping-methods`, {
    method: "POST",
    body: JSON.stringify({ option_id: optionId }),
  })
  const data = await res.json()
  
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  return NextResponse.json(data)
}

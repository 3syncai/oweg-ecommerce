import { NextRequest, NextResponse } from "next/server"

const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY
const SALES_CHANNEL_ID = process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID

async function backend(path: string, init?: RequestInit) {
  const base = MEDUSA_BACKEND_URL.replace(/\/$/, "")
  const headers: HeadersInit = {}
  
  if (PUBLISHABLE_KEY) {
    (headers as Record<string, string>)["x-publishable-api-key"] = PUBLISHABLE_KEY
  }
  if (SALES_CHANNEL_ID) {
    (headers as Record<string, string>)["x-sales-channel-id"] = SALES_CHANNEL_ID
  }
  
  // For FormData, don't set content-type - fetch will set it automatically with boundary
  // Only add custom headers if body is not FormData
  const isFormData = init?.body instanceof FormData
  if (!isFormData && init?.headers) {
    Object.assign(headers, init.headers)
  }
  
  return fetch(`${base}${path}`, {
    cache: "no-store",
    ...init,
    headers: isFormData ? headers : { ...headers, ...(init?.headers as HeadersInit) },
  })
}

export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    
    // Get the form data from the request
    const formData = await req.formData()
    
    // Forward the form data to the Medusa backend
    // Note: FormData will automatically set the correct content-type with boundary
    const res = await backend(`/store/products/${id}/reviews/upload-media`, {
      method: "POST",
      body: formData,
      // Explicitly don't set content-type - FormData will set it with the boundary
    })
    
    if (!res.ok) {
      const errorText = await res.text()
      let error
      try {
        error = JSON.parse(errorText)
      } catch {
        error = { message: errorText || "Failed to upload media" }
      }
      console.error("Backend error:", error)
      return NextResponse.json(error, { status: res.status })
    }
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Error uploading review media:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { message: "Failed to upload media", error: errorMessage },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-publishable-api-key",
    },
  })
}


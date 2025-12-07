const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:9000"

function getPublishableKey() {
  return (
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_API_KEY ||
    ""
  )
}

export function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  const base = BACKEND_URL.replace(/\/$/, "")
  const url = `${base}${path}`
  const publishableKey = getPublishableKey()

  // Get affiliate token from localStorage if available
  const affiliateToken = typeof window !== 'undefined' ? localStorage.getItem("affiliate_token") : null
  
  // Debug logging (remove in production)
  if (typeof window !== 'undefined' && path.includes('/admin/')) {
    console.log("API Request to:", url)
    console.log("Token exists:", !!affiliateToken)
    console.log("Token length:", affiliateToken?.length || 0)
  }

  // Check if body is FormData - if so, don't set content-type header (browser will set it with boundary)
  const isFormData = init?.body instanceof FormData
  
  // Build headers - avoid duplication
  const headers: Record<string, string> = {}
  
  // Add publishable key
  if (publishableKey) {
    headers["x-publishable-api-key"] = publishableKey
  }
  
  // Add authorization token
  if (affiliateToken) {
    headers["Authorization"] = `Bearer ${affiliateToken}`
  }
  
  // Merge init headers (but don't duplicate content-type)
  const initHeaders = (init?.headers as Record<string, string>) || {}
  Object.keys(initHeaders).forEach(key => {
    const lowerKey = key.toLowerCase()
    if (lowerKey === 'content-type' && !isFormData) {
      // Use the provided content-type, or default to application/json
      headers["content-type"] = initHeaders[key] || "application/json"
    } else if (lowerKey !== 'content-type') {
      // Add other headers
      headers[key] = initHeaders[key]
    }
  })
  
  // Set content-type if not already set and not FormData
  if (!isFormData && !headers["content-type"]) {
    headers["content-type"] = "application/json"
  }
  
  // Debug logging for headers (remove in production)
  if (typeof window !== 'undefined' && path.includes('/admin/')) {
    console.log("Authorization header:", headers["Authorization"] ? "Present" : "Missing")
    console.log("Request URL:", url)
    console.log("Content-Type header:", headers["content-type"])
  }

  // Log request details for debugging
  if (typeof window !== 'undefined' && path.includes('/commissions')) {
    console.log("API Request details:", {
      url,
      method: init?.method || "GET",
      hasBody: !!init?.body,
      bodyType: init?.body ? typeof init.body : "none",
      bodyPreview: init?.body ? (typeof init.body === 'string' ? init.body.substring(0, 200) : String(init.body).substring(0, 200)) : "none",
      headers: Object.keys(headers),
    })
  }

  return fetch(url, {
    ...init,
    headers,
    credentials: "include",
  }).catch((error) => {
    // Enhanced error logging
    console.error("Fetch error details:", {
      url,
      error: error.message,
      type: error.name,
      stack: error.stack,
    })
    throw error
  })
}

export { BACKEND_URL }


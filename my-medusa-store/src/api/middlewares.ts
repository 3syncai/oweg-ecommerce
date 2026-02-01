import { defineMiddlewares } from "@medusajs/framework/http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"

/**
 * Middleware to fix cross-origin session cookies for Chrome/Safari.
 * 
 * Problem: When admin is on ecomm-admin-ecru.vercel.app and backend is on api.oweg.itshover.com,
 * Chrome/Safari block cookies because they're cross-origin (third-party) by default.
 * 
 * Solution: Intercept Set-Cookie headers and add SameSite=None; Secure attributes,
 * which tells browsers to allow the cookie in cross-origin requests over HTTPS.
 */
async function crossOriginCookieMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  // Store the original setHeader function
  const originalSetHeader = res.setHeader.bind(res)

  // Override setHeader to intercept Set-Cookie headers
  res.setHeader = function (name: string, value: string | string[]): any {
    if (name.toLowerCase() === 'set-cookie') {
      // Modify cookies to be cross-origin compatible
      const modifyCookie = (cookie: string): string => {
        // Remove any existing SameSite attribute to avoid duplicates
        let modifiedCookie = cookie.replace(/;\s*SameSite=[^;]*/gi, '')

        // Add SameSite=None for cross-origin support
        if (!modifiedCookie.toLowerCase().includes('samesite')) {
          modifiedCookie += '; SameSite=None'
        }

        // Add Secure flag (required when SameSite=None)
        if (!modifiedCookie.toLowerCase().includes('secure')) {
          modifiedCookie += '; Secure'
        }

        return modifiedCookie
      }

      if (Array.isArray(value)) {
        value = value.map(modifyCookie)
      } else {
        value = modifyCookie(value)
      }
    }
    return originalSetHeader(name, value)
  }

  next()
}

async function corsMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  // Get allowed origins from environment or use default
  // Supports comma-separated URLs
  const baseOrigins = process.env.STORE_CORS || process.env.AUTH_CORS || "http://localhost:3000,http://localhost:3001,https://oweg-ecommerce.vercel.app"
  const vendorPortalOrigin = process.env.VENDOR_CORS || "http://localhost:4000"

  // Combine all explicit origins
  const allOriginsRaw = `${baseOrigins},${vendorPortalOrigin}`
  const originList = allOriginsRaw.split(',').map(o => o.trim())

  // Get the origin from the request
  const origin = (req as any).headers?.origin || (req as any).headers?.referer

  // Determine allowed origin
  let allowedOrigin = ""

  if (origin) {
    // 1. Check if exact match in list
    if (originList.includes(origin)) {
      allowedOrigin = origin
    }
    // 2. Check if it's a Vercel preview URL (only if not production or if explicitly desired)
    // Allow any .vercel.app subdomain for flexibility in previews
    else if (origin.endsWith('.vercel.app') && !originList.includes('*')) {
      allowedOrigin = origin
    }
    // 3. Fallback for localhost in development if not explicitly listed but matches pattern
    else if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
      allowedOrigin = origin
    }
  }

  // If no origin matched but we have a wildcard
  if (!allowedOrigin && originList.includes('*')) {
    allowedOrigin = '*'
  }

  // Set CORS headers ONLY if we have a valid allowed origin
  // AND if headers haven't been sent yet
  if (allowedOrigin && !res.headersSent) {
    // Check if header is already set to avoid "multiple values" error
    const existingOrigin = res.getHeader('Access-Control-Allow-Origin')

    if (!existingOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Access-Control-Max-Age', '86400') // 24 hours
    }
  }

  // Handle preflight OPTIONS request
  if ((req as any).method === 'OPTIONS') {
    // Ensure we end the response here so it doesn't propagate to other handlers
    // that might try to write headers again
    return res.status(200).end()
  }

  next()
}

export default defineMiddlewares({
  routes: [
    // Apply cross-origin cookie middleware to all auth routes (for admin login)
    {
      matcher: /^\/auth\/.*/,
      middlewares: [crossOriginCookieMiddleware],
    },
    // Apply to admin routes as well
    {
      matcher: /^\/admin\/.*/,
      middlewares: [crossOriginCookieMiddleware],
    },
    {
      matcher: /^\/vendor\/.*/,
      middlewares: [corsMiddleware, crossOriginCookieMiddleware],
    },
    {
      matcher: /^\/store\/vendors\/.*/,
      middlewares: [corsMiddleware],
    },
    {
      matcher: /^\/store\/return-requests$/,
      middlewares: [],
    },
  ],
})

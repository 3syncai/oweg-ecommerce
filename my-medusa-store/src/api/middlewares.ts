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
  const normalizeOrigin = (value?: string | null) => value?.trim().replace(/\/$/, "").toLowerCase()

  const getHeaderValue = (headerName: string): string | undefined => {
    const headers = (req as any).headers
    if (!headers) return undefined

    if (typeof headers.get === "function") {
      const value = headers.get(headerName)
      return typeof value === "string" ? value : undefined
    }

    const direct = headers[headerName] ?? headers[headerName.toLowerCase()] ?? headers[headerName.toUpperCase()]
    if (Array.isArray(direct)) {
      return direct[0]
    }
    return typeof direct === "string" ? direct : undefined
  }

  const rawOrigin = getHeaderValue("origin")
  const rawReferer = getHeaderValue("referer")
  const requestOrigin = normalizeOrigin(rawOrigin)
    || (() => {
      if (!rawReferer) return undefined
      try {
        return normalizeOrigin(new URL(rawReferer).origin)
      } catch {
        return undefined
      }
    })()

  // Merge all possible env-based allowlists instead of picking only one.
  const configuredOrigins = [
    process.env.STORE_CORS,
    process.env.AUTH_CORS,
    process.env.ADMIN_CORS,
    process.env.VENDOR_CORS,
    "http://localhost:3000,http://localhost:3001,http://localhost:4000,https://oweg-ecommerce.vercel.app",
  ]
    .filter(Boolean)
    .flatMap((value) => value!.split(","))
    .map((value) => value.trim())
    .filter(Boolean)

  const normalizedOriginList = Array.from(new Set(configuredOrigins.map((value) => normalizeOrigin(value)!).filter(Boolean)))

  const allowedOrigin = requestOrigin && normalizedOriginList.includes(requestOrigin)
    ? requestOrigin
    : normalizedOriginList.includes("*")
      ? "*"
      : normalizedOriginList[0]

  // Set CORS headers for all vendor routes
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Max-Age', '86400') // 24 hours

  // Handle preflight OPTIONS request
  if ((req as any).method === 'OPTIONS') {
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

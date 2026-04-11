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
  const originalSetHeader = res.setHeader.bind(res)

  res.setHeader = function (name: string, value: string | string[]): any {
    if (name.toLowerCase() === "set-cookie") {
      const modifyCookie = (cookie: string): string => {
        let modifiedCookie = cookie.replace(/;\s*SameSite=[^;]*/gi, "")
        if (!modifiedCookie.toLowerCase().includes("samesite")) {
          modifiedCookie += "; SameSite=None"
        }
        if (!modifiedCookie.toLowerCase().includes("secure")) {
          modifiedCookie += "; Secure"
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

/**
 * CORS middleware for /vendor/* routes.
 *
 * Medusa's built-in CORS only covers /store/*, /admin/*, and /auth/*.
 * Vendor routes are custom, so we must handle CORS ourselves.
 *
 * CRITICAL: We call res.removeHeader before res.setHeader to guarantee
 * exactly ONE Access-Control-Allow-Origin value. Multiple values cause
 * browser CORS failures.
 */
async function vendorCorsMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const normalizeOrigin = (value?: string | null) =>
    value?.trim().replace(/\/$/, "").toLowerCase()

  const requestOrigin = normalizeOrigin(
    (req as any).headers?.origin as string | undefined
  )

  // Build origin allowlist from env vars
  const allowedOrigins = [
    process.env.VENDOR_CORS,
    process.env.AUTH_CORS,
    process.env.STORE_CORS,
    // Hardcoded fallbacks for safety
    "http://localhost:4000",
    "http://localhost:3000",
    "http://localhost:3001",
  ]
    .filter(Boolean)
    .flatMap((v) => v!.split(","))
    .map((v) => normalizeOrigin(v))
    .filter((v): v is string => Boolean(v))

  const uniqueOrigins = Array.from(new Set(allowedOrigins))

  // Echo back the exact requesting origin if it's allowed, otherwise use first allowed
  const allowOrigin =
    requestOrigin && uniqueOrigins.includes(requestOrigin)
      ? requestOrigin
      : uniqueOrigins[0] ?? "http://localhost:4000"

  // Remove any existing header first to prevent duplicates
  if (typeof (res as any).removeHeader === "function") {
    ;(res as any).removeHeader("Access-Control-Allow-Origin")
    ;(res as any).removeHeader("access-control-allow-origin")
  }

  res.setHeader("Access-Control-Allow-Origin", allowOrigin)
  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-publishable-api-key")
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Max-Age", "86400")

  // Respond immediately to preflight OPTIONS requests
  if ((req as any).method === "OPTIONS") {
    return res.status(200).end()
  }

  next()
}

export default defineMiddlewares({
  routes: [
    // Cross-origin cookie shim for Medusa auth/admin routes
    {
      matcher: /^\/auth\/.*/,
      middlewares: [crossOriginCookieMiddleware],
    },
    {
      matcher: /^\/admin\/.*/,
      middlewares: [crossOriginCookieMiddleware],
    },
    // All /vendor/* routes (including /vendor/auth/login) go through our
    // vendor CORS middleware. This is the ONLY place we set CORS headers for
    // vendor routes — Medusa's built-in CORS does not cover /vendor/.
    {
      matcher: /^\/vendor\/.*/,
      middlewares: [vendorCorsMiddleware, crossOriginCookieMiddleware],
    },
  ],
})

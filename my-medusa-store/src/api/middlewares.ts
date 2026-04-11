import { defineMiddlewares } from "@medusajs/framework/http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"

/**
 * Cross-origin cookie middleware for Chrome/Safari.
 * Adds SameSite=None; Secure to Set-Cookie headers for cross-origin support.
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

      value = Array.isArray(value) ? value.map(modifyCookie) : modifyCookie(value)
    }
    return originalSetHeader(name, value)
  }

  next()
}

/**
 * CORS middleware for /vendor/* routes.
 *
 * WHY THIS EXISTS:
 * - Medusa's built-in CORS only covers /store/*, /admin/*, and /auth/*.
 * - /vendor/* are custom routes with no built-in CORS protection.
 * - HOWEVER, routes like /vendor/auth/login contain "auth" in the path,
 *   which causes Medusa's authCors middleware to ALSO fire and overwrite
 *   our header with the wrong origin.
 *
 * THE FIX:
 * We set our correct header first, then LOCK it by intercepting res.setHeader
 * so any subsequent framework-level CORS cannot overwrite it.
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
    "http://localhost:4000",
    "http://localhost:3000",
    "http://localhost:3001",
  ]
    .filter(Boolean)
    .flatMap((v) => v!.split(","))
    .map((v) => normalizeOrigin(v))
    .filter((v): v is string => Boolean(v))

  const uniqueOrigins = Array.from(new Set(allowedOrigins))

  // Echo back the exact requesting origin if allowed, else use first in list
  const allowOrigin =
    requestOrigin && uniqueOrigins.includes(requestOrigin)
      ? requestOrigin
      : uniqueOrigins[0] ?? "http://localhost:4000"

  // Set the correct CORS headers
  const setAllCorsHeaders = () => {
    if (typeof (res as any).removeHeader === "function") {
      ;(res as any).removeHeader("Access-Control-Allow-Origin")
      ;(res as any).removeHeader("access-control-allow-origin")
    }
    // Use the underlying Node.js method directly to bypass any overrides
    const proto = Object.getPrototypeOf(res) as any
    const nativeSetHeader = proto.setHeader
      ? proto.setHeader.bind(res)
      : (res as any).__originalSetHeader ?? res.setHeader.bind(res)
    nativeSetHeader("Access-Control-Allow-Origin", allowOrigin)
    nativeSetHeader("Vary", "Origin")
    nativeSetHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
    nativeSetHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-publishable-api-key")
    nativeSetHeader("Access-Control-Allow-Credentials", "true")
    nativeSetHeader("Access-Control-Max-Age", "86400")
  }

  setAllCorsHeaders()

  // Lock Access-Control-Allow-Origin so Medusa's own CORS cannot overwrite it.
  // (Medusa's authCors fires for paths containing /auth/ and overwrites the header
  //  with the first value from AUTH_CORS, which is wrong for vendor routes.)
  const originalSetHeader = res.setHeader.bind(res)
  res.setHeader = function (name: string, value: string | string[]): any {
    if (name.toLowerCase() === "access-control-allow-origin") {
      // Silently ignore — our value is already correct
      return res
    }
    return originalSetHeader(name, value)
  }

  // Respond immediately to OPTIONS preflight
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
    // /vendor/* — our CORS middleware locks the correct origin header
    // so Medusa's native authCors cannot overwrite it
    {
      matcher: /^\/vendor\/.*/,
      middlewares: [vendorCorsMiddleware, crossOriginCookieMiddleware],
    },
  ],
})

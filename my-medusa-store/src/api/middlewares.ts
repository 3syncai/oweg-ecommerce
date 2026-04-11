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
 *
 * NOTE: We intentionally do NOT set Access-Control-Allow-Origin here.
 * Medusa's built-in CORS middleware (driven by STORE_CORS / AUTH_CORS / ADMIN_CORS / VENDOR_CORS
 * in medusa-config.ts) is the single source of truth for that header.
 * Adding a second origin-setting middleware causes duplicate values which browsers reject.
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
    if (name.toLowerCase() === "set-cookie") {
      // Modify cookies to be cross-origin compatible
      const modifyCookie = (cookie: string): string => {
        // Remove any existing SameSite attribute to avoid duplicates
        let modifiedCookie = cookie.replace(/;\s*SameSite=[^;]*/gi, "")

        // Add SameSite=None for cross-origin support
        if (!modifiedCookie.toLowerCase().includes("samesite")) {
          modifiedCookie += "; SameSite=None"
        }

        // Add Secure flag (required when SameSite=None)
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
    // Vendor routes: cookie shim only.
    // Medusa's native CORS (STORE_CORS / AUTH_CORS / VENDOR_CORS) handles
    // Access-Control-Allow-Origin. A second CORS middleware would produce
    // duplicate header values that browsers reject.
    {
      matcher: /^\/vendor\/.*/,
      middlewares: [crossOriginCookieMiddleware],
    },
  ],
})

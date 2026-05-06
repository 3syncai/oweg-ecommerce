import { defineMiddlewares } from "@medusajs/framework/http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { parseCorsOrigins } from "@medusajs/framework/utils"
import cors from "cors"

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
 * Build the allowed origin list for /vendor/* routes from env variables.
 * Supports VENDOR_CORS, AUTH_CORS, STORE_CORS plus a default localhost set.
 */
function getVendorAllowedOrigins(): string[] {
  const fromEnv = [
    process.env.VENDOR_CORS,
    process.env.AUTH_CORS,
    process.env.STORE_CORS,
  ]
    .filter(Boolean)
    .flatMap((v) => v!.split(","))
    .map((v) => v.trim())
    .filter(Boolean)

  const defaults = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:4000",
    "http://localhost:5000",
  ]

  return Array.from(new Set([...fromEnv, ...defaults]))
}

/**
 * CORS middleware for /vendor/* routes.
 *
 * Medusa's built-in CORS only protects /store, /admin, /auth namespaces.
 * Custom /vendor routes need their own CORS handling, otherwise the browser
 * blocks all cross-origin requests with "No 'Access-Control-Allow-Origin'
 * header is present on the requested resource".
 */
function vendorCorsMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const allowed = getVendorAllowedOrigins()

  return cors({
    origin: parseCorsOrigins(allowed.join(",")),
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-publishable-api-key",
      "x-medusa-access-token",
    ],
  })(req as any, res as any, next as any)
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/auth",
      middlewares: [crossOriginCookieMiddleware],
    },
    {
      matcher: "/admin",
      middlewares: [crossOriginCookieMiddleware],
    },
    {
      matcher: "/vendor",
      middlewares: [vendorCorsMiddleware, crossOriginCookieMiddleware],
    },
  ],
})

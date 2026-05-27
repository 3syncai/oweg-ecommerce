import { defineMiddlewares } from "@medusajs/framework/http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
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
 * Hard-coded allow-list of first-party frontend origins for /vendor/* routes.
 *
 * History note: this used to be built from env vars + defaults and piped
 * through `parseCorsOrigins(...)`. In production that produced 204 preflight
 * responses with NO `Access-Control-Allow-Origin` header for EVERY origin
 * (even localhost:3000), which blocked the browser. The most likely culprit
 * was that `parseCorsOrigins` was misinterpreting entries (a stray slash or
 * trailing comma converts an exact string into a regex, which then doesn't
 * match). Whatever the root cause, the safest and most debuggable fix is
 * to skip that helper entirely and use a small explicit allow-list +
 * a function-form origin matcher. If origin matching ever breaks again,
 * VENDOR_CORS_DEBUG=true makes it log every check.
 *
 * Production frontends:
 *   https://oweg-ecommerce.vercel.app          (storefront)
 *   https://oweg-vendor-portal.vercel.app      (vendor portal)
 * Plus every Vercel preview deployment for both projects.
 * Plus the usual localhost dev ports.
 *
 * Override / extend at runtime via:
 *   VENDOR_CORS, STORE_CORS, AUTH_CORS   (comma-separated exact origins)
 */
const VENDOR_ALLOWED_LITERAL_ORIGINS = new Set<string>([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:4000",
  "http://localhost:9000",
  "https://oweg-ecommerce.vercel.app",
  "https://oweg-vendor-portal.vercel.app",
  "https://www.0weg.in",
  "https://0weg.in",
  "https://oweg-ecommerce-o3lv.vercel.app"
])

// Anything matching these regexes is also allowed. Covers Vercel preview
// deployments which get a fresh subdomain on every push.
const VENDOR_ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/oweg-ecommerce-[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/oweg-vendor-portal-[a-z0-9-]+\.vercel\.app$/,
]

function buildVendorAllowList(): { literal: Set<string>; patterns: RegExp[] } {
  const literal = new Set(VENDOR_ALLOWED_LITERAL_ORIGINS)
  const envSources = [
    process.env.VENDOR_CORS,
    process.env.AUTH_CORS,
    process.env.STORE_CORS,
  ]
  for (const src of envSources) {
    if (!src) continue
    for (const raw of src.split(",")) {
      const value = raw.trim()
      if (value) literal.add(value)
    }
  }
  return { literal, patterns: VENDOR_ALLOWED_ORIGIN_PATTERNS }
}

const VENDOR_CORS_DEBUG = process.env.VENDOR_CORS_DEBUG === "true"

function isOriginAllowedForVendor(origin: string): boolean {
  const { literal, patterns } = buildVendorAllowList()
  if (literal.has(origin)) return true
  for (const p of patterns) {
    if (p.test(origin)) return true
  }
  return false
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
  return cors({
    origin: (origin, callback) => {
      // Same-origin / curl / server-to-server requests have no Origin header.
      // Allow them — they aren't subject to browser CORS anyway.
      if (!origin) return callback(null, true)

      const ok = isOriginAllowedForVendor(origin)
      if (VENDOR_CORS_DEBUG) {
        console.log(
          `[vendorCors] origin=${origin} -> ${ok ? "ALLOW" : "DENY"}`
        )
      }
      // We pass `true` (not the origin string) so the `cors` package echoes
      // back the request's Origin exactly. Returning `false` here would
      // suppress the header and let the response fall through without
      // Access-Control-Allow-Origin — which is what was breaking production.
      callback(null, ok)
    },
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

import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { verifyVendorToken } from "./token"

const PUBLIC_PREFIXES = [
  "/vendor/login",
  "/vendor/auth/login",
  "/vendor/pending",
  "/vendor/reset-password",
]

function isPublicVendorPath(url: string): boolean {
  const path = url.split("?")[0] || ""
  return PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
}

/**
 * Global /vendor auth: require a valid vendor JWT except login/pending/reset.
 * Individual handlers still call requireVendorAuth for vendor_id scoping.
 */
export async function requireVendorBearerMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  if (req.method === "OPTIONS") return next()

  const path = (req.originalUrl || req.url || "").split("?")[0] || ""
  if (isPublicVendorPath(path)) return next()

  const headers: any = (req as any).headers || {}
  const rawAuth = headers.authorization || headers.Authorization || ""
  const auth = typeof rawAuth === "string" ? rawAuth : ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  const claims = await verifyVendorToken(token)
  if (!claims) {
    return res.status(401).json({ message: "Invalid token" })
  }

  ;(req as any).vendor_auth = claims
  return next()
}

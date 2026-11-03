import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { signVendorToken } from "../../_lib/token"

// CORS is handled by Medusa's built-in framework CORS middleware via
// AUTH_CORS / STORE_CORS in medusa-config.ts. Setting headers here
// would produce duplicate Access-Control-Allow-Origin values.

const loginAttempts = new Map<string, number[]>()

function rateLimitLogin(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now()
  const recent = (loginAttempts.get(key) || []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    loginAttempts.set(key, recent)
    return false
  }
  recent.push(now)
  loginAttempts.set(key, recent)
  return true
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  return res.status(200).end()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)

  // In Medusa v2 (Express), JSON body is available on req.body
  const body = (req as any).body ?? {}
  const email = body.email
  const password = body.password

  if (!email || !password) {
    return res.status(400).json({ message: "email and password required" })
  }

  const ip =
    (typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
      : "") ||
    (typeof req.headers["x-real-ip"] === "string" ? req.headers["x-real-ip"] : "") ||
    "unknown"
  const emailKey = String(email).trim().toLowerCase()
  if (!rateLimitLogin(`vendor-login:${emailKey}:${ip}`)) {
    return res.status(429).json({ message: "Too many login attempts. Try again shortly." })
  }
  const user = await vendorService.authenticateVendorUser(email, password)
  const token = signVendorToken({ sub: user.id, vendor_id: user.vendor_id!, scope: "vendor" })

  // Get vendor details to include rejection status
  let vendor: any = null
  if (user.vendor_id) {
    const vendors = await vendorService.listVendors({ id: user.vendor_id })
    if (vendors && vendors.length > 0) {
      vendor = vendors[0]
    }
  }

  return res.json({
    token,
    vendor_user: {
      id: user.id,
      email: user.email,
      vendor_id: user.vendor_id,
      must_reset_password: (user as any)?.must_reset_password ?? false,
    },
    vendor: vendor
      ? {
          id: vendor.id,
          name: vendor.name,
          email: vendor.email,
          is_approved: vendor.is_approved,
          rejected_at: vendor.rejected_at,
          rejection_reason: vendor.rejection_reason,
        }
      : null,
  })
}

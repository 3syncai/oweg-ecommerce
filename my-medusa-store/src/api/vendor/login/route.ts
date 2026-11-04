import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../modules/vendor"
import { signVendorToken } from "../_lib/token"
import { checkRateLimit, clientIpFromMedusaReq } from "../../../lib/simple-rate-limit"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)

  const body = (req as any).body ?? {}
  const email = body.email
  const password = body.password

  if (!email || !password) {
    return res.status(400).json({ message: "email and password required" })
  }

  const ip = clientIpFromMedusaReq(req as any)
  const limited = checkRateLimit({
    key: `vendor-login-legacy:${String(email).trim().toLowerCase()}:${ip}`,
    limit: 10,
    windowMs: 60_000,
  })
  if (!limited.allowed) {
    res.setHeader("Retry-After", String(limited.retryAfterSec))
    return res.status(429).json({ message: "Too many login attempts. Try again shortly." })
  }

  const user = await vendorService.authenticateVendorUser(email, password)
  const token = signVendorToken({ sub: user.id, vendor_id: user.vendor_id!, scope: "vendor" })

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


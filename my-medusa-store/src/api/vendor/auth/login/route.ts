import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { signVendorToken } from "../../_lib/token"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Set CORS headers
  setCorsHeaders(res)

  const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  
  // In Medusa v2 (Express), JSON body is available on req.body
  const body = (req as any).body ?? {}
  const email = body.email
  const password = body.password
  
  if (!email || !password) {
    return res.status(400).json({ message: "email and password required" })
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
    vendor: vendor ? {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
      is_approved: vendor.is_approved,
      rejected_at: vendor.rejected_at,
      rejection_reason: vendor.rejection_reason,
    } : null,
  })
}



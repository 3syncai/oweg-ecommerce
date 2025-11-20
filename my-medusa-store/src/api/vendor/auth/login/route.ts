import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { signVendorToken } from "../../_lib/token"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
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
  return res.json({
    token,
    vendor_user: {
      id: user.id,
      email: user.email,
      vendor_id: user.vendor_id,
      must_reset_password: (user as any)?.must_reset_password ?? false,
    },
  })
}



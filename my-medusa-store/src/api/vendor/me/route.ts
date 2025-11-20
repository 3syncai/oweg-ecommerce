import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { requireApprovedVendor } from "../_lib/guards"
import VendorModuleService from "../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../modules/vendor"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return
  const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  const vendor = await vendorService.retrieveVendor(auth.vendor_id)
  return res.json({ vendor })
}



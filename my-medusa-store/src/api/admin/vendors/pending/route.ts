import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    // MedusaService list accepts plain filter object (not nested under `filters`)
    const vendors = await vendorService.listVendors({ is_approved: false })
    return res.json({ vendors })
  } catch {
    // Return empty to avoid breaking the UI
    return res.json({ vendors: [] })
  }
}



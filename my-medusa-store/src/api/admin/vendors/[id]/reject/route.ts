import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../../modules/vendor"

export async function POST(
  req: MedusaRequest, 
  res: MedusaResponse
) {
  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    
    // Extract ID from URL path - Medusa v2 approach
    const id = req.params?.id as string
    
    if (!id) {
      console.error("No vendor ID in params:", req.params)
      return res.status(400).json({ 
        message: "Missing vendor id",
        params: req.params 
      })
    }

    console.log("Rejecting vendor with ID:", id)
    
    // Delete vendor or mark as rejected
    await vendorService.deleteVendors(id)
    
    return res.json({ 
      message: "Vendor rejected successfully",
      id, 
      status: "rejected" 
    })
  } catch (error: any) {
    console.error("Reject vendor error:", error)
    return res.status(500).json({ 
      message: error?.message || "Failed to reject vendor",
      error: error?.toString()
    })
  }
}
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
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

    console.log("Approving vendor with ID:", id)
    
    const adminId = ((req as any).user as any)?.id ?? null
    const vendor = await vendorService.approveVendor(id, adminId)
    
    return res.json({ 
      message: "Vendor approved successfully",
      vendor 
    })
  } catch (error: any) {
    console.error("Approve vendor error:", error)
    return res.status(500).json({ 
      message: error?.message || "Failed to approve vendor",
      error: error?.toString()
    })
  }
}
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../../modules/vendor"

// Medusa v2 automatically protects /admin/* routes with authentication middleware
// If this route handler is reached, the user is already authenticated by Medusa
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

    // Extract rejection reason from request body
    const body = req.body as { rejection_reason?: string } || {}
    const { rejection_reason } = body
    
    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({ 
        message: "Rejection reason is required"
      })
    }

    console.log("Rejecting vendor with ID:", id, "Reason:", rejection_reason)
    
    const adminId = ((req as any).user as any)?.id ?? null
    
    // Reject vendor with reason
    const vendor = await vendorService.rejectVendor(id, rejection_reason.trim(), adminId)
    
    return res.json({ 
      message: "Vendor rejected successfully",
      vendor,
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


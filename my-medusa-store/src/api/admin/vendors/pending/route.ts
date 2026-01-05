import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"

// Medusa v2 automatically protects /admin/* routes with authentication middleware
// If this route handler is reached, the user is already authenticated by Medusa
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    console.log('Admin vendors/pending: Request received')
    
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    
    // MedusaService list accepts plain filter object (not nested under `filters`)
    // Get all unapproved vendors
    const allUnapproved = await vendorService.listVendors({ is_approved: false })
    
    // Filter out rejected vendors (only show truly pending vendors)
    // A vendor is pending if: is_approved = false AND rejected_at IS NULL
    const pendingVendors = (allUnapproved || []).filter((vendor: any) => {
      return !vendor.rejected_at && !vendor.is_approved
    })
    
    console.log('Admin vendors/pending: Successfully fetched', pendingVendors?.length || 0, 'pending vendors (filtered out rejected)')
    
    // Return vendors array - empty if none found
    return res.json({ 
      vendors: pendingVendors || [],
      count: pendingVendors?.length || 0
    })
  } catch (error: any) {
    console.error('Admin vendors/pending error:', error)
    console.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    })
    
    // Return empty array on error to prevent UI breakage
    return res.json({ 
      vendors: [],
      count: 0,
      message: error?.message || "Failed to fetch vendors"
    })
  }
}


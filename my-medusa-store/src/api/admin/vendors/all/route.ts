import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { Modules } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    console.log('Admin vendors/all: Request received')
    
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    
    // Get all vendors
    const allVendors = await vendorService.listVendors({})
    
    console.log('Admin vendors/all: Total vendors found:', allVendors?.length || 0)
    
    // Get all products to count vendor products
    const allProducts = await productModuleService.listProducts({})
    
    // Process vendors and add product counts
    const vendorsWithProducts = (allVendors || []).map((vendor: any) => {
      // Count products for this vendor
      const vendorProducts = (allProducts || []).filter((p: any) => {
        const metadata = p.metadata || {}
        return metadata.vendor_id === vendor.id
      })
      
      // Determine status
      let status = "pending"
      if (vendor.is_approved && vendor.approved_at) {
        status = "approved"
      } else if (vendor.rejected_at) {
        status = "rejected"
      }
      
      return {
        ...vendor,
        status,
        product_count: vendorProducts.length,
        products: vendorProducts.map((p: any) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          approval_status: p.metadata?.approval_status || null,
          created_at: p.created_at,
          thumbnail: p.thumbnail,
        })),
      }
    })
    
    // Separate by status
    const approvedVendors = vendorsWithProducts.filter((v: any) => v.status === "approved")
    const rejectedVendors = vendorsWithProducts.filter((v: any) => v.status === "rejected")
    const pendingVendors = vendorsWithProducts.filter((v: any) => v.status === "pending")
    
    console.log('Admin vendors/all: Status breakdown:', {
      approved: approvedVendors.length,
      rejected: rejectedVendors.length,
      pending: pendingVendors.length,
    })
    
    return res.json({
      vendors: vendorsWithProducts,
      approved: approvedVendors,
      rejected: rejectedVendors,
      pending: pendingVendors,
      counts: {
        total: vendorsWithProducts.length,
        approved: approvedVendors.length,
        rejected: rejectedVendors.length,
        pending: pendingVendors.length,
      },
    })
  } catch (error: any) {
    console.error('Admin vendors/all error:', error)
    return res.status(500).json({
      message: "Failed to fetch vendors",
      error: error?.message || String(error),
      vendors: [],
      approved: [],
      rejected: [],
      pending: [],
      counts: {
        total: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
      },
    })
  }
}

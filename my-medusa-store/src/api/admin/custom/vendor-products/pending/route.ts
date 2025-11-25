import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import VendorModuleService from "../../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../../modules/vendor"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const productModuleService = req.scope.resolve(Modules.PRODUCT)
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    
    // Get all products
    const allProducts = await productModuleService.listProducts({})

    console.log("Total products fetched:", allProducts?.length || 0)
    
    // Filter products with pending approval status
    const pendingProducts = (allProducts || []).filter((p: any) => {
      const metadata = p.metadata || {}
      const hasPendingStatus = metadata.approval_status === "pending"
      
      // Log for debugging
      if (metadata.vendor_id) {
        console.log(`Product ${p.id}: vendor_id=${metadata.vendor_id}, approval_status=${metadata.approval_status}, status=${p.status}`)
      }
      
      return hasPendingStatus
    })

    console.log("Pending products found:", pendingProducts.length)

    // Get all vendors to map vendor_id to vendor info
    const allVendors = await vendorService.listVendors({})
    const vendorMap = new Map()
    allVendors.forEach((v: any) => {
      vendorMap.set(v.id, v)
    })

    // Enrich products with vendor information
    const productsWithVendor = pendingProducts.map((p: any) => {
      const metadata = p.metadata || {}
      const vendorId = metadata.vendor_id
      const vendor = vendorId ? vendorMap.get(vendorId) : null

      return {
        ...p,
        vendor: vendor ? {
          id: vendor.id,
          name: vendor.name,
          store_name: vendor.store_name,
          email: vendor.email,
        } : null,
      }
    })

    return res.json({ products: productsWithVendor })
  } catch (error) {
    console.error("Error fetching pending products:", error)
    return res.status(500).json({
      message: "Failed to fetch pending products",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}


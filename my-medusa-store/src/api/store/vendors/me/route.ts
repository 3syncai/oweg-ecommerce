import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"

// Get vendor ID from token (simple verification)
function getVendorIdFromRequest(req: MedusaRequest): string | null {
  // Check Authorization header
  const authHeader = (req.headers as any).authorization || (req.headers as any).Authorization
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7)
    try {
      // Simple JWT decode (without verification for now - you should add proper verification)
      const parts = token.split(".")
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString())
        if (payload.vendor_id) {
          return payload.vendor_id
        }
      }
    } catch (e) {
      // Invalid token
    }
  }
  
  // Check X-Vendor-Token header (fallback)
  const vendorToken = (req.headers as any)["x-vendor-token"] || (req.headers as any)["X-Vendor-Token"]
  if (vendorToken) {
    try {
      const parts = vendorToken.split(".")
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString())
        if (payload.vendor_id) {
          return payload.vendor_id
        }
      }
    } catch (e) {
      // Invalid token
    }
  }
  
  return null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    
    const vendorId = getVendorIdFromRequest(req)
    
    if (!vendorId) {
      return res.status(401).json({ 
        message: "Unauthorized. Please provide vendor token."
      })
    }

    const vendors = await vendorService.listVendors({ id: vendorId })
    
    if (!vendors || vendors.length === 0) {
      return res.status(404).json({ 
        message: "Vendor not found"
      })
    }

    const vendor = vendors[0]
    
    return res.json({ 
      vendor
    })
  } catch (error: any) {
    console.error("Get vendor error:", error)
    return res.status(500).json({ 
      message: error?.message || "Failed to fetch vendor",
      error: error?.toString()
    })
  }
}


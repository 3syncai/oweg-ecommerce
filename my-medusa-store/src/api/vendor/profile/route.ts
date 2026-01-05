import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import VendorModuleService from "../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../modules/vendor"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    const vendor = await vendorService.retrieveVendor(auth.vendor_id)
    return res.json({ vendor })
  } catch (error: any) {
    console.error("Vendor profile retrieve error:", error)
    return res.status(500).json({ message: error?.message || "Failed to retrieve profile" })
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    const body = (req as any).body || {}
    
    const {
      name,
      phone,
      store_name,
      store_logo,
    } = body

    // Only allow updating certain fields
    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (phone !== undefined) updateData.phone = phone
    if (store_name !== undefined) updateData.store_name = store_name
    if (store_logo !== undefined) updateData.store_logo = store_logo

    const updated = await vendorService.updateVendors({
      id: auth.vendor_id,
      ...updateData,
    })

    return res.json({ vendor: updated })
  } catch (error: any) {
    console.error("Vendor profile update error:", error)
    return res.status(500).json({ message: error?.message || "Failed to update profile" })
  }
}


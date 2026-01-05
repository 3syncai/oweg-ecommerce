import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"

const ReapplySchema = z.object({
  // Personal Information
  name: z.string().min(1).optional(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  telephone: z.string().optional().nullable(),

  // Store Information
  store_name: z.string().optional().nullable(),
  store_phone: z.string().optional().nullable(),
  store_address: z.string().optional().nullable(),
  store_country: z.string().optional().nullable(),
  store_region: z.string().optional().nullable(),
  store_city: z.string().optional().nullable(),
  store_pincode: z.string().optional().nullable(),
  store_logo: z.string().optional().nullable(),
  store_banner: z.string().optional().nullable(),
  shipping_policy: z.string().optional().nullable(),
  return_policy: z.string().optional().nullable(),
  whatsapp_number: z.string().optional().nullable(),

  // Tax & Legal Information
  pan_gst: z.string().optional().nullable(),
  gst_no: z.string().optional().nullable(),
  pan_no: z.string().optional().nullable(),

  // Banking Information
  bank_name: z.string().optional().nullable(),
  account_no: z.string().optional().nullable(),
  ifsc_code: z.string().optional().nullable(),
  cancel_cheque_url: z.string().optional().nullable(),

  // Documents
  documents: z.array(z.object({
    key: z.string(),
    url: z.string(),
    name: z.string().optional(),
    type: z.string().optional(),
  })).optional().nullable(),
})

// Get vendor ID from token
function getVendorIdFromRequest(req: MedusaRequest): string | null {
  const authHeader = (req.headers as any).authorization || (req.headers as any).Authorization
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7)
    try {
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

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    
    const vendorId = getVendorIdFromRequest(req)
    
    if (!vendorId) {
      return res.status(401).json({ 
        message: "Unauthorized. Please provide vendor token."
      })
    }

    // Validate request body
    const validated = ReapplySchema.parse(req.body || {})
    
    console.log("Vendor reapply request for ID:", vendorId)
    
    // Reapply vendor (updates data and resets rejection status)
    const vendor = await vendorService.reapplyVendor(vendorId, validated)
    
    return res.json({ 
      message: "Reapply successful. Your request is now pending admin review.",
      vendor
    })
  } catch (error: any) {
    console.error("Reapply vendor error:", error)
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Invalid request data",
        errors: error.errors
      })
    }
    
    return res.status(500).json({ 
      message: error?.message || "Failed to reapply",
      error: error?.toString()
    })
  }
}


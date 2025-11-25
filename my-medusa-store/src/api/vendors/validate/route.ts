import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
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

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)

  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    const body = (req as any).body ?? {}
    const { field, value } = body

    if (!field || !value) {
      return res.status(400).json({ message: "Field and value are required" })
    }

    // Get all vendors to check for duplicates
    const allVendors = await vendorService.listVendors({})

    let exists = false
    let message = ""

    switch (field) {
      case "email":
        exists = allVendors.some((v: any) => v.email?.toLowerCase() === value.toLowerCase())
        message = exists ? "Email already exists" : ""
        break

      case "phone":
      case "telephone":
        // Check both phone and telephone fields
        const phoneValue = value.replace(/\D/g, "") // Remove non-digits
        exists = allVendors.some((v: any) => {
          const vPhone = v.phone?.replace(/\D/g, "") || ""
          const vTelephone = v.telephone?.replace(/\D/g, "") || ""
          return vPhone === phoneValue || vTelephone === phoneValue
        })
        message = exists ? "Phone number already exists" : ""
        break

      case "pan_no":
        const panValue = value.toUpperCase().replace(/\s/g, "")
        exists = allVendors.some((v: any) => {
          const vPan = v.pan_no?.toUpperCase().replace(/\s/g, "") || ""
          return vPan === panValue
        })
        message = exists ? "PAN number already exists" : ""
        break

      case "gst_no":
        const gstValue = value.toUpperCase().replace(/\s/g, "")
        exists = allVendors.some((v: any) => {
          const vGst = v.gst_no?.toUpperCase().replace(/\s/g, "") || ""
          return vGst === gstValue
        })
        message = exists ? "GST number already exists" : ""
        break

      case "store_name":
        const storeNameValue = value.trim()
        exists = allVendors.some((v: any) => {
          const vStoreName = (v.store_name || "").trim()
          return vStoreName.toLowerCase() === storeNameValue.toLowerCase() && vStoreName !== ""
        })
        message = exists ? "Store name already exists" : ""
        break

      case "store_phone":
        const storePhoneDigits = value.replace(/\D/g, "")
        exists = allVendors.some((v: any) => {
          const vStorePhone = (v.store_phone || "").replace(/\D/g, "")
          return vStorePhone === storePhoneDigits && vStorePhone !== ""
        })
        message = exists ? "Store phone number already exists" : ""
        break

      default:
        return res.status(400).json({ message: "Invalid field" })
    }

    return res.json({
      exists,
      message,
    })
  } catch (error: any) {
    console.error("Validation error:", error)
    return res.status(500).json({
      message: "Validation failed",
      error: error?.message || String(error),
    })
  }
}

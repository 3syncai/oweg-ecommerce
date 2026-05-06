import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../_lib/guards"
import VendorModuleService from "../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../modules/vendor"

// CORS is handled centrally in src/api/middlewares.ts (vendorCorsMiddleware).
// Don't set Access-Control-* headers here — duplicate values break the browser
// preflight and using `*` together with credentials is rejected.

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  return res.status(204).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    const vendor = await vendorService.retrieveVendor(auth.vendor_id)
    return res.json({ vendor })
  } catch (error: any) {
    console.error("Vendor profile retrieve error:", error)
    return res
      .status(500)
      .json({ message: error?.message || "Failed to retrieve profile" })
  }
}

// Whitelist of fields a vendor is allowed to self-update from the portal.
// Email, approval status, banking, and tax IDs are intentionally excluded —
// those require admin re-verification.
const UPDATABLE_FIELDS = [
  "name",
  "first_name",
  "last_name",
  "phone",
  "telephone",
  "whatsapp_number",
  "store_name",
  "store_phone",
  "store_address",
  "store_country",
  "store_region",
  "store_city",
  "store_pincode",
  "store_logo",
  "store_banner",
  "shipping_policy",
  "return_policy",
] as const

type UpdatableField = (typeof UPDATABLE_FIELDS)[number]

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const auth = await requireApprovedVendor(req, res)
  if (!auth) return

  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    const body = ((req as any).body || {}) as Record<string, unknown>

    const updateData: Record<string, unknown> = {}
    for (const field of UPDATABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        const value = body[field as UpdatableField]
        // Treat empty strings as null so optional fields can be cleared cleanly.
        updateData[field] = value === "" ? null : value
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No updatable fields provided" })
    }

    const updated = await vendorService.updateVendors({
      id: auth.vendor_id,
      ...updateData,
    })

    return res.json({ vendor: updated })
  } catch (error: any) {
    console.error("Vendor profile update error:", error)
    return res
      .status(500)
      .json({ message: error?.message || "Failed to update profile" })
  }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { resolveS3ViewUrl } from "../../../../lib/s3-access"

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

    const vendors = await Promise.all(
      (pendingVendors || []).map(async (vendor: any) => {
        const documents = Array.isArray(vendor.documents)
          ? await Promise.all(
              vendor.documents.map(async (doc: any) => ({
                ...doc,
                signed_url: await resolveS3ViewUrl({ key: doc.key, url: doc.url }),
              }))
            )
          : vendor.documents
        const [cancel_cheque_signed_url, store_banner_signed_url, store_logo_signed_url] =
          await Promise.all([
            resolveS3ViewUrl({ url: vendor.cancel_cheque_url }),
            resolveS3ViewUrl({ url: vendor.store_banner }),
            resolveS3ViewUrl({ url: vendor.store_logo }),
          ])
        return {
          ...vendor,
          documents,
          cancel_cheque_signed_url,
          store_banner_signed_url,
          store_logo_signed_url,
        }
      })
    )
    
    console.log('Admin vendors/pending: Successfully fetched', vendors.length, 'pending vendors (filtered out rejected)')
    
    return res.json({ 
      vendors,
      count: vendors.length
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


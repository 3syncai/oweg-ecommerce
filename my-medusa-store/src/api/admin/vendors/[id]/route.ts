import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { Modules } from "@medusajs/framework/utils"
import { resolveS3ViewUrl } from "../../../../lib/s3-access"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { id } = req.params
        console.log('Admin vendor detail: Fetching vendor ID:', id)

        const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
        const productModuleService = req.scope.resolve(Modules.PRODUCT)

        // Get vendor by ID
        const vendor = await vendorService.retrieveVendor(id)

        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" })
        }

        // Get all products for this vendor
        const allProducts = await productModuleService.listProducts({})
        const vendorProducts = allProducts.filter((p: any) => {
            const metadata = p.metadata || {}
            return metadata.vendor_id === vendor.id
        })

        // Get brand authorizations
        let brandAuthorizations: any[] = []
        try {
            const brandAuthService = req.scope.resolve("vendorBrandAuthorization") as any
            const authorizations = await brandAuthService.listVendorAuthorizations(vendor.id)

            brandAuthorizations = await Promise.all(
                (authorizations || []).map(async (auth: any) => {
                    const signedUrl = await resolveS3ViewUrl({
                        key: auth.authorization_file_key,
                        url: auth.authorization_file_url,
                    })

                    return {
                        id: auth.id,
                        brand_name: auth.brand_name,
                        file_url: auth.authorization_file_url,
                        signed_url: signedUrl,
                        verified: auth.verified,
                        verified_at: auth.verified_at,
                        verified_by: auth.verified_by,
                        created_at: auth.created_at,
                        updated_at: auth.updated_at,
                        metadata: auth.metadata,
                    }
                })
            )
        } catch (brandAuthError: any) {
            console.warn('Failed to fetch brand authorizations:', brandAuthError?.message)
        }

        const documentsWithSignedUrls = Array.isArray(vendor.documents)
            ? await Promise.all(
                vendor.documents.map(async (doc: any) => ({
                    ...doc,
                    signed_url: await resolveS3ViewUrl({ key: doc.key, url: doc.url }),
                }))
              )
            : []

        const [cancelChequeSignedUrl, storeBannerSignedUrl, storeLogoSignedUrl] = await Promise.all([
            resolveS3ViewUrl({ url: vendor.cancel_cheque_url }),
            resolveS3ViewUrl({ url: vendor.store_banner }),
            resolveS3ViewUrl({ url: vendor.store_logo }),
        ])

        // Determine status
        let status = "pending"
        if (vendor.is_approved && vendor.approved_at) {
            status = "approved"
        } else if (vendor.rejected_at) {
            status = "rejected"
        }

        // Return comprehensive vendor data
        return res.json({
            vendor: {
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
                documents: documentsWithSignedUrls,
                cancel_cheque_signed_url: cancelChequeSignedUrl,
                store_banner_signed_url: storeBannerSignedUrl,
                store_logo_signed_url: storeLogoSignedUrl,
                brand_authorizations: brandAuthorizations,
            }
        })
    } catch (error: any) {
        console.error('Admin vendor detail error:', error)
        return res.status(500).json({
            message: "Failed to fetch vendor details",
            error: error?.message || String(error),
        })
    }
}

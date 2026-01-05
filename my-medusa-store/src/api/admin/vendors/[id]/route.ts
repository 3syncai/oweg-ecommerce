import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { Modules } from "@medusajs/framework/utils"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

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

            // Generate signed URLs for authorization files
            const fileService = req.scope.resolve(Modules.FILE)
            const s3Client = (fileService as any).client_
            const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET

            brandAuthorizations = await Promise.all(
                (authorizations || []).map(async (auth: any) => {
                    let signedUrl = auth.authorization_file_url

                    // Generate signed URL if file is in S3
                    if (auth.authorization_file_key && s3Client && bucket) {
                        try {
                            const command = new GetObjectCommand({
                                Bucket: bucket,
                                Key: auth.authorization_file_key,
                            })
                            signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
                        } catch (signedUrlError) {
                            console.warn('Failed to generate signed URL:', signedUrlError)
                        }
                    }

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

        // Generate signed URLs for vendor documents
        let documentsWithSignedUrls: any[] = []
        if (vendor.documents && Array.isArray(vendor.documents)) {
            const fileService = req.scope.resolve(Modules.FILE)
            const s3Client = (fileService as any).client_
            const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET

            documentsWithSignedUrls = await Promise.all(
                vendor.documents.map(async (doc: any) => {
                    let signedUrl = doc.url

                    if (doc.key && s3Client && bucket) {
                        try {
                            const command = new GetObjectCommand({
                                Bucket: bucket,
                                Key: doc.key,
                            })
                            signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
                        } catch (signedUrlError) {
                            console.warn('Failed to generate signed URL for document:', signedUrlError)
                        }
                    }

                    return {
                        ...doc,
                        signed_url: signedUrl,
                    }
                })
            )
        }

        // Generate signed URL for cancel cheque
        let cancelChequeSignedUrl = vendor.cancel_cheque_url
        if (vendor.cancel_cheque_url) {
            try {
                const fileService = req.scope.resolve(Modules.FILE)
                const s3Client = (fileService as any).client_
                const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET

                // Extract S3 key from URL if it's an S3 URL
                const urlParts = vendor.cancel_cheque_url.split('/')
                const key = urlParts.slice(3).join('/')

                if (s3Client && bucket && key) {
                    const command = new GetObjectCommand({
                        Bucket: bucket,
                        Key: key,
                    })
                    cancelChequeSignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
                }
            } catch (signedUrlError) {
                console.warn('Failed to generate signed URL for cancel cheque:', signedUrlError)
            }
        }

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

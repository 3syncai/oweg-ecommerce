import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import s3Service from "../../../../../services/s3-service"

export async function GET(
    req: MedusaRequest<{ id: string }>,
    res: MedusaResponse
) {
    try {
        const productId = req.params.id

        // Get product to extract brand and vendor info
        const productModuleService = req.scope.resolve(Modules.PRODUCT)
        const product = await productModuleService.retrieveProduct(productId)

        if (!product) {
            return res.status(404).json({
                error: "Product not found"
            })
        }

        // Extract brand from metadata
        const brandName = product.metadata?.brand as string || null
        const vendorId = product.metadata?.vendor_id as string || null

        if (!brandName || !vendorId) {
            return res.json({
                has_authorization: false,
                message: brandName ? "No vendor ID found" : "No brand specified for this product"
            })
        }

        // Get brand authorization
        const brandAuthService = req.scope.resolve("vendorBrandAuthorization") as any
        const authorization = await brandAuthService.getBrandAuthorization(vendorId, brandName)

        if (!authorization) {
            return res.json({
                has_authorization: false,
                brand_name: brandName,
                message: "No authorization found for this brand"
            })
        }

        // Generate signed URL for secure file access (valid for 1 hour)
        const signedUrl = await s3Service.getSignedUrl(authorization.authorization_file_key, 3600)

        return res.json({
            has_authorization: true,
            authorization: {
                id: authorization.id,
                brand_name: authorization.brand_name,
                file_url: authorization.authorization_file_url,
                signed_url: signedUrl,
                uploaded_at: authorization.created_at,
                verified: authorization.verified,
                verified_at: authorization.verified_at,
                vendor_id: authorization.vendor_id,
                metadata: authorization.metadata,
            }
        })
    } catch (error: any) {
        console.error("Get brand authorization error:", error)
        return res.status(500).json({
            error: error.message || "Failed to get brand authorization"
        })
    }
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { requireApprovedVendor } from "../../_lib/guards"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
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
        const brandName = req.query.brand_name as string

        if (!brandName) {
            return res.status(400).json({
                error: "Missing brand_name parameter"
            })
        }

        const brandAuthService = req.scope.resolve("vendorBrandAuthorization") as any

        const authorization = await brandAuthService.getBrandAuthorization(
            auth.vendor_id,
            brandName
        )

        if (authorization) {
            return res.json({
                requires_authorization: false,
                authorization: {
                    brand_name: authorization.brand_name,
                    uploaded_at: authorization.created_at,
                    verified: authorization.verified,
                    file_url: authorization.authorization_file_url,
                }
            })
        } else {
            return res.json({
                requires_authorization: true,
                brand_name: brandName,
            })
        }
    } catch (error: any) {
        console.error("Check brand authorization error:", error)
        return res.status(500).json({
            error: error.message || "Failed to check brand authorization"
        })
    }
}

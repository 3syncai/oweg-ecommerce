import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { id } = req.params
        const body = (req as any).body || {}
        const { verified_by } = body

        console.log('Admin brand authorization verify: ID:', id)

        // Get brand auth service
        const brandAuthService = req.scope.resolve("vendorBrandAuthorization") as any

        // Get the user ID from the request (you may need to adjust this based on your auth setup)
        const adminUserId = verified_by || "admin" // Default to "admin" if not provided

        // Verify the brand authorization
        const updated = await brandAuthService.verifyBrandAuthorization(id, adminUserId)

        console.log('✅ Brand authorization verified:', id)

        return res.json({
            success: true,
            authorization: updated,
            message: "Brand authorization verified successfully"
        })
    } catch (error: any) {
        console.error('Admin brand authorization verify error:', error)
        return res.status(500).json({
            success: false,
            message: "Failed to verify brand authorization",
            error: error?.message || String(error),
        })
    }
}

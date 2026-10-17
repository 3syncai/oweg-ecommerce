import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const authorizationId = req.params.id
    const body = (req as any).body || {}
    const rejectedBy = typeof body.rejected_by === "string" && body.rejected_by.trim()
      ? body.rejected_by.trim()
      : "admin"
    const reason = typeof body.reason === "string" ? body.reason : undefined
    const brandAuthService = req.scope.resolve("vendorBrandAuthorization") as any
    const authorization = await brandAuthService.rejectBrandAuthorization(
      authorizationId,
      rejectedBy,
      reason
    )

    return res.json({
      success: true,
      authorization,
      message: "Brand authorization rejected",
    })
  } catch (error: any) {
    console.error("Admin brand authorization reject error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to reject brand authorization",
      error: error?.message || String(error),
    })
  }
}

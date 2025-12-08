import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AffiliateModuleService from "../../../../../../modules/affiliate/service"
import { AFFILIATE_MODULE } from "../../../../../../modules/affiliate"
import { verifyAffiliateToken } from "../../../../../affiliate/_lib/token"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse, req?: MedusaRequest) {
  const origin = req?.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// Authenticate affiliate admin
async function authenticateAffiliateAdmin(req: MedusaRequest): Promise<{ isValid: boolean; adminId?: string }> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { isValid: false }
    }

    const token = authHeader.substring(7)
    const claims = verifyAffiliateToken(token)
    
    if (!claims || claims.role !== "admin") {
      return { isValid: false }
    }

    return { isValid: true, adminId: claims.sub }
  } catch (error) {
    return { isValid: false }
  }
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  return res.status(200).end()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  
  // Authenticate affiliate admin
  const auth = await authenticateAffiliateAdmin(req)
  if (!auth.isValid) {
    return res.status(401).json({
      message: "Unauthorized. Please login as an affiliate admin.",
    })
  }

  try {
    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)
    
    const userId = req.params?.id as string
    
    if (!userId) {
      return res.status(400).json({ 
        message: "Missing user id",
      })
    }

    const body = req.body as { rejection_reason?: string } || {}
    const { rejection_reason } = body
    
    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({ 
        message: "Rejection reason is required"
      })
    }

    // Use authenticated affiliate admin ID
    const adminId = auth.adminId || null

    const user = await affiliateService.rejectAffiliateUser(userId, rejection_reason.trim(), adminId)

    // Remove password_hash from response
    const { password_hash, ...sanitizedUser } = user

    return res.json({ 
      message: "Affiliate user rejected successfully",
      user: sanitizedUser,
    })
  } catch (error: any) {
    console.error("Reject affiliate user error:", error)
    
    if (error.type === "NOT_FOUND") {
      return res.status(404).json({
        message: error.message || "Affiliate user not found",
      })
    }

    return res.status(500).json({ 
      message: error?.message || "Failed to reject affiliate user",
      error: error?.toString()
    })
  }
}


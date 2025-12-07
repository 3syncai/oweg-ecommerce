import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AffiliateModuleService from "../../../../modules/affiliate/service"
import { AFFILIATE_MODULE } from "../../../../modules/affiliate"
import { verifyAffiliateToken } from "../../../affiliate/_lib/token"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse, req?: MedusaRequest) {
  const origin = req?.headers.origin || '*'
  // When using credentials, we must specify the exact origin, not '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// Authenticate affiliate admin
async function authenticateAffiliateAdmin(req: MedusaRequest): Promise<{ isValid: boolean; adminId?: string; error?: string }> {
  try {
    const authHeader = req.headers.authorization
    console.log("Auth header:", authHeader ? "Present" : "Missing")
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No Bearer token found")
      return { isValid: false, error: "No authorization header" }
    }

    const token = authHeader.substring(7)
    console.log("Token extracted, length:", token.length)
    
    const claims = verifyAffiliateToken(token)
    console.log("Token claims:", claims ? { sub: claims.sub, role: claims.role } : "Invalid")
    
    if (!claims) {
      return { isValid: false, error: "Invalid token" }
    }
    
    if (claims.role !== "admin") {
      return { isValid: false, error: `Invalid role: ${claims.role}, expected admin` }
    }

    return { isValid: true, adminId: claims.sub }
  } catch (error: any) {
    console.error("Auth error:", error)
    return { isValid: false, error: error?.message || "Authentication error" }
  }
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  
  // Authenticate affiliate admin
  const auth = await authenticateAffiliateAdmin(req)
  if (!auth.isValid) {
    console.log("Authentication failed:", auth.error)
    return res.status(401).json({
      message: "Unauthorized. Please login as an affiliate admin.",
      error: auth.error || "Authentication failed",
    })
  }

  try {
    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)

    // Get all affiliate users
    const affiliateUsers = await affiliateService.listAffiliateUsers({})

    // Remove password_hash from response
    const sanitizedUsers = (affiliateUsers || []).map((user: any) => {
      const { password_hash, ...rest } = user
      return rest
    })

    // Separate by status
    const pendingUsers = sanitizedUsers.filter((u: any) => !u.is_approved && !u.rejected_at)
    const approvedUsers = sanitizedUsers.filter((u: any) => u.is_approved)
    const rejectedUsers = sanitizedUsers.filter((u: any) => u.rejected_at)

    return res.json({
      users: sanitizedUsers,
      pending: pendingUsers,
      approved: approvedUsers,
      rejected: rejectedUsers,
      counts: {
        total: sanitizedUsers.length,
        pending: pendingUsers.length,
        approved: approvedUsers.length,
        rejected: rejectedUsers.length,
      },
    })
  } catch (error: any) {
    console.error("Admin affiliate/users GET error:", error)
    return res.status(500).json({
      message: "Failed to fetch affiliate users",
      error: error?.message || String(error),
      users: [],
      pending: [],
      approved: [],
      rejected: [],
    })
  }
}


import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AffiliateModuleService from "../../../modules/affiliate/service"
import { AFFILIATE_MODULE } from "../../../modules/affiliate"
import { verifyAffiliateToken } from "../_lib/token"

// CORS headers helper
function setCorsHeaders(res: MedusaResponse, req?: MedusaRequest) {
  const origin = req?.headers.origin || '*'
  // When using credentials, we must specify the exact origin, not '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)
  return res.status(200).end()
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)

  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" })
    }

    const token = authHeader.substring(7)
    const claims = verifyAffiliateToken(token)
    
    if (!claims) {
      return res.status(401).json({ message: "Invalid token" })
    }

    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)

    if (claims.role === "admin") {
      const admins = await affiliateService.listAffiliateAdmins({ id: claims.sub })
      if (!admins || admins.length === 0) {
        return res.status(404).json({ message: "Admin not found" })
      }
      const { password_hash, ...admin } = admins[0]
      return res.json({ user: admin, role: "admin" })
    } else {
      const users = await affiliateService.listAffiliateUsers({ id: claims.sub })
      if (!users || users.length === 0) {
        return res.status(404).json({ message: "User not found" })
      }
      const { password_hash, ...user } = users[0]
      return res.json({ user, role: "user" })
    }
  } catch (error: any) {
    console.error("Get affiliate user error:", error)
    return res.status(500).json({
      message: "Failed to get user information",
      error: error?.message || String(error),
    })
  }
}


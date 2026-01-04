import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AffiliateModuleService from "../../../../modules/affiliate/service"
import { AFFILIATE_MODULE } from "../../../../modules/affiliate"
import { signAffiliateToken } from "../../_lib/token"

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

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)

  try {
    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)
    
    const body = req.body as { email?: string; password?: string } || {}
    const email = body.email
    const password = body.password
    
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" })
    }

    // Get client IP
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
               (req.headers['x-real-ip'] as string) || 
               req.socket?.remoteAddress || 
               null

    const user = await affiliateService.authenticateAffiliateUser(email, password, ip || undefined)
    
    const role = (user as any).role || "user"
    
    // If admin, redirect to admin dashboard
    if (role === "admin") {
      const token = signAffiliateToken({ 
        sub: user.id, 
        role: "admin",
        scope: "affiliate" 
      })
      const { password_hash, ...sanitizedUser } = user
      return res.json({
        token,
        user: sanitizedUser,
        role,
        redirectTo: "/admin/dashboard",
      })
    }

    // For regular users, check approval status
    if (role === "user" && !(user as any).is_approved) {
      const token = signAffiliateToken({ 
        sub: user.id, 
        role: "user",
        scope: "affiliate" 
      })
      const { password_hash, ...sanitizedUser } = user
      return res.json({
        token,
        user: sanitizedUser,
        role,
        redirectTo: "/verification-pending",
        is_approved: false,
      })
    }

    // User is approved, allow access to dashboard
    const token = signAffiliateToken({ 
      sub: user.id, 
      role: "user",
      scope: "affiliate" 
    })
    const { password_hash, ...sanitizedUser } = user

    return res.json({
      token,
      user: sanitizedUser,
      role,
      redirectTo: "/dashboard",
      is_approved: true,
    })
  } catch (error: any) {
    console.error("Affiliate login error:", error)
    return res.status(401).json({
      message: error?.message || "Invalid credentials",
    })
  }
}


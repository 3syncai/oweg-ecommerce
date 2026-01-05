import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AffiliateModuleService from "../../../../modules/affiliate/service"
import { AFFILIATE_MODULE } from "../../../../modules/affiliate"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // Medusa admin routes are protected by default middleware
  try {
    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)

    // Get all affiliate admins
    const affiliateAdmins = await affiliateService.listAffiliateAdmins({})

    // Remove password_hash from response
    const sanitizedAdmins = (affiliateAdmins || []).map((admin: any) => {
      const { password_hash, ...rest } = admin
      return rest
    })

    return res.json({
      affiliateAdmins: sanitizedAdmins,
    })
  } catch (error: any) {
    console.error("Admin affiliate/admins GET error:", error)
    return res.status(500).json({
      message: "Failed to fetch affiliate admins",
      error: error?.message || String(error),
      affiliateAdmins: [],
    })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Medusa admin routes are protected by default middleware
  try {
    const body = req.body as { name?: string; email?: string; password?: string } || {}
    const { name, email, password } = body

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email, and password are required",
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      })
    }

    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)

    // Create affiliate admin
    const affiliateAdmin = await affiliateService.createAffiliateAdmin({
      name,
      email,
      password,
    })

    // Remove password_hash from response
    const { password_hash, ...sanitizedAdmin } = affiliateAdmin

    return res.json({
      affiliateAdmin: sanitizedAdmin,
      message: "Affiliate admin created successfully",
    })
  } catch (error: any) {
    console.error("Admin affiliate/admins POST error:", error)

    if (error.type === "DUPLICATE_ERROR") {
      return res.status(409).json({
        message: error.message || "Affiliate admin with this email already exists",
      })
    }

    return res.status(500).json({
      message: "Failed to create affiliate admin",
      error: error?.message || String(error),
    })
  }
}


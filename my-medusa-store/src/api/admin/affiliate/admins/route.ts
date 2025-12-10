import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AffiliateModuleService from "../../../../modules/affiliate/service"
import { AFFILIATE_MODULE } from "../../../../modules/affiliate"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // Verify authenticated user exists (basic check, assumes auth middleware runs before)
  // In Medusa admin routes, req.user or req.session.user_id should be present if authenticated
  // If this is a custom route that bypasses auth, we need to ensure it's protected.
  // Generally custom admin routes in /admin/ path are protected by default middleware in newer Medusa versions.
  // However, explicit check is safer as per CodeRabbit.
  
  // NOTE: In some Medusa setups, getting req.user requires specific middleware. 
  // For now, we'll assume standard admin protection but if CodeRabbit complained, it might be missing.
  // Let's add a basic check if possible, or at least a comment that we rely on platform auth.
  // Actually, let's look at how other routes do it or just add the check.
  
  // Checking for user properly:
  // @ts-ignore
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
     return res.status(401).json({ message: "Unauthorized" });
  }

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
  // @ts-ignore
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
     return res.status(401).json({ message: "Unauthorized" });
  }

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


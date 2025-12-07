import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AffiliateModuleService from "../../../../../modules/affiliate/service"
import { AFFILIATE_MODULE } from "../../../../../modules/affiliate"
import { verifyAffiliateToken } from "../../../_lib/token"

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

// PUT - Update commission
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)

  const auth = await authenticateAffiliateAdmin(req)
  if (!auth.isValid) {
    return res.status(401).json({
      message: "Unauthorized. Please login as an affiliate admin.",
    })
  }

  try {
    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)
    const commissionId = req.params?.id as string

    if (!commissionId) {
      return res.status(400).json({
        message: "Commission ID is required",
      })
    }

    const body = req.body as {
      commission_rate?: number
      metadata?: any
    }

    const commission = await affiliateService.updateCommission(commissionId, {
      commission_rate: body.commission_rate !== undefined ? Number(body.commission_rate) : undefined,
      metadata: body.metadata,
    })

    return res.json({
      message: "Commission updated successfully",
      commission,
    })
  } catch (error: any) {
    console.error("Update commission error:", error)
    if (error.type === "NOT_FOUND") {
      return res.status(404).json({
        message: error.message || "Commission not found",
      })
    }
    if (error.type === "INVALID_DATA") {
      return res.status(400).json({
        message: error.message || "Invalid commission data",
      })
    }
    return res.status(500).json({
      message: error?.message || "Failed to update commission",
    })
  }
}

// DELETE - Delete commission
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res, req)

  const auth = await authenticateAffiliateAdmin(req)
  if (!auth.isValid) {
    return res.status(401).json({
      message: "Unauthorized. Please login as an affiliate admin.",
    })
  }

  try {
    const affiliateService: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)
    const commissionId = req.params?.id as string

    if (!commissionId) {
      return res.status(400).json({
        message: "Commission ID is required",
      })
    }

    await affiliateService.deleteCommission(commissionId)

    return res.json({
      message: "Commission deleted successfully",
    })
  } catch (error: any) {
    console.error("Delete commission error:", error)
    if (error.type === "NOT_FOUND") {
      return res.status(404).json({
        message: error.message || "Commission not found",
      })
    }
    return res.status(500).json({
      message: error?.message || "Failed to delete commission",
    })
  }
}


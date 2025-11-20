import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { verifyVendorToken } from "./token"
import VendorModuleService from "../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../modules/vendor"

export async function requireApprovedVendor(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<{ vendor_id: string } | null> {
  // Express style headers object
  const headers: any = (req as any).headers || {}
  const rawAuth = headers.authorization || headers.Authorization || ""
  const auth = typeof rawAuth === "string" ? rawAuth : ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token) {
    res.status(401).json({ message: "Unauthorized" })
    return null
  }
  const claims = verifyVendorToken(token)
  if (!claims) {
    res.status(401).json({ message: "Invalid token" })
    return null
  }
  const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  try {
    await vendorService.ensureApproved(claims.vendor_id)
  } catch {
    res.status(403).json({ message: "Vendor not approved" })
    return null
  }
  return { vendor_id: claims.vendor_id }
}

export async function requireVendorAuth(req: MedusaRequest): Promise<string | null> {
  const headers: any = (req as any).headers || {}
  const rawAuth = headers.authorization || headers.Authorization || ""
  const auth = typeof rawAuth === "string" ? rawAuth : ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  
  if (!token) {
    return null
  }
  
  const claims = verifyVendorToken(token)
  if (!claims) {
    return null
  }
  
  return claims.vendor_id
}


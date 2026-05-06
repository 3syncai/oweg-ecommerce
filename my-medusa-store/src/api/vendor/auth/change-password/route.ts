import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { verifyVendorToken } from "../../_lib/token"

export async function OPTIONS(_req: MedusaRequest, res: MedusaResponse) {
  return res.status(204).end()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const headers: any = (req as any).headers || {}
    const rawAuth = headers.authorization || headers.Authorization || ""
    const authHeader = typeof rawAuth === "string" ? rawAuth : ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" })
    }
    const claims = verifyVendorToken(token)
    if (!claims?.sub) {
      return res.status(401).json({ message: "Invalid token" })
    }

    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    const body = (req as any).body || {}
    // Accept both naming conventions to stay backwards-compatible with the
    // existing portal client.
    const oldPassword: string = body.old_password || body.current_password || ""
    const newPassword: string = body.new_password || ""

    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current and new password are required" })
    }
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters" })
    }
    if (oldPassword === newPassword) {
      return res
        .status(400)
        .json({ message: "New password must be different from the current one" })
    }

    const current = await vendorService
      .retrieveVendorUser(claims.sub)
      .catch(() => null)
    if (!current) return res.status(404).json({ message: "User not found" })

    try {
      await vendorService.authenticateVendorUser(current.email, oldPassword)
    } catch {
      return res.status(401).json({ message: "Current password is incorrect" })
    }

    const bcrypt = await import("bcryptjs")
    const password_hash = await bcrypt.hash(newPassword, 10)
    await vendorService.updateVendorUsers({
      id: current.id,
      password_hash,
      last_login_at: new Date(),
      must_reset_password: false,
    })
    return res.json({ ok: true })
  } catch (e: any) {
    return res
      .status(400)
      .json({ message: e?.message || "Unable to change password" })
  }
}

import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
    const body = (req as any).body || {}
    const oldPassword: string = body.old_password || ""
    const newPassword: string = body.new_password || ""
    if (!oldPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "Invalid password payload" })
    }
    const user = (req as any).user
    if (!user?.id) {
      return res.status(401).json({ message: "Unauthorized" })
    }
    // re-authenticate using current credentials
    const current = await vendorService.retrieveVendorUser(user.id).catch(() => null)
    if (!current) return res.status(404).json({ message: "User not found" })
    // verify old password
    await vendorService.authenticateVendorUser(current.email, oldPassword)
    // set new password & clear must_reset flag
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
    return res.status(400).json({ message: e?.message || "Unable to change password" })
  }
}



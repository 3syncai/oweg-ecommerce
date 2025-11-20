import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"

const SignupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  pan_gst: z.string().optional(),
  store_name: z.string().optional(),
  store_logo: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  documents: z
    .array(
      z.object({
        key: z.string(),
        url: z.string().url(),
        name: z.string().optional(),
        type: z.string().optional(),
      })
    )
    .optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendorService: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  // In Medusa v2 (Express), JSON body is available on req.body
  const body = (req as any).body ?? {}
  const parsed = SignupSchema.safeParse(body)
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues })
  }
  const { password, ...vendorData } = parsed.data
  const created = await vendorService.createPendingVendor(vendorData)
  // If password provided at signup, create a vendor user now (still requires approval to use dashboard)
  if (password && password.length >= 8) {
    try {
      await vendorService.createVendorUser({
        email: vendorData.email,
        password,
        vendor_id: created.id,
      })
      // leave must_reset_password at its default (true) so they are prompted to reset on first login
    } catch (e) {
      // If user already exists, ignore; admin can manage credentials
      // Do not fail the vendor creation because of a user creation issue
      // eslint-disable-next-line no-console
      console.warn("Create vendor user skipped:", (e as any)?.message || e)
    }
  }
  return res.status(201).json({ vendor: created })
}



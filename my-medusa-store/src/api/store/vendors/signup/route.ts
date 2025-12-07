import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import VendorModuleService from "../../../../modules/vendor/service"
import { VENDOR_MODULE } from "../../../../modules/vendor"

const SignupSchema = z.object({
  // Personal Information
  name: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  telephone: z.string().optional(),

  // Store Information
  store_name: z.string().optional(),
  store_phone: z.string().optional(),
  store_address: z.string().optional(),
  store_country: z.string().optional(),
  store_region: z.string().optional(),
  store_city: z.string().optional(),
  store_pincode: z.string().optional(),
  store_logo: z.string().optional(),
  store_banner: z.string().optional(),
  shipping_policy: z.string().optional(),
  return_policy: z.string().optional(),
  whatsapp_number: z.string().optional(),

  // Tax & Legal Information
  pan_gst: z.string().optional(), // Legacy combined field
  gst_no: z.string().optional(),
  pan_no: z.string().optional(),

  // Banking Information
  bank_name: z.string().optional(),
  account_no: z.string().optional(),
  ifsc_code: z.string().optional(),
  cancel_cheque_url: z.string().optional(),

  // Documents
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

  // Password
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
})

// CORS headers helper
function setCorsHeaders(res: MedusaResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-publishable-api-key')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setCorsHeaders(res)
  return res.status(200).end()
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Set CORS headers
  setCorsHeaders(res)

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
       
      console.warn("Create vendor user skipped:", (e as any)?.message || e)
    }
  }
  return res.status(201).json({ vendor: created })
}



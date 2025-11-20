import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { generateVendorSignupHTML } from "./vendorSignup"

// Public (no publishable key required) HTML form that POSTs to store APIs with the key header
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const base = (process.env.BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const pk =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_API_KEY ||
    ""
  
  const html = generateVendorSignupHTML(base, pk)
  
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.send(html)
}



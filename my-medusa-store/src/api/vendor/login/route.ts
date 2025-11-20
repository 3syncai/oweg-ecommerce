import { MedusaRequest, MedusaResponse } from "@medusajs/framework"

// Redirect to unified login page
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.redirect("/app/unified-login")
}



import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { readMobileMenu } from "../../../lib/mobile-shop-menu"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const items = (await readMobileMenu(req)).filter(item => item.visible)
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120")
  return res.json({ items })
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { publishMobileMenu, readMobileMenu } from "../../../lib/mobile-shop-menu"
import { parseMobileMenu } from "../../../shared/mobile-shop-menu"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  return res.json({ items: await readMobileMenu(req) })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const items = parseMobileMenu((req.body as { items?: unknown } | undefined)?.items)
  if (!items) return res.status(400).json({ message: "Check labels, sections and storefront paths. Each destination must be unique." })
  if (!await publishMobileMenu(req, items)) return res.status(503).json({ message: "Store settings are unavailable." })
  return res.json({ items })
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { handleShiprocketWebhook } from "../../shiprocket/webhook/handler"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  return res.json({
    ok: true,
    message: "Shiprocket webhook endpoint. Shiprocket sends POST requests here.",
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return handleShiprocketWebhook(req, res)
}

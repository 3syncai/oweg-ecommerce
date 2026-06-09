import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { handleShiprocketWebhook } from "./handler"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return handleShiprocketWebhook(req, res)
}

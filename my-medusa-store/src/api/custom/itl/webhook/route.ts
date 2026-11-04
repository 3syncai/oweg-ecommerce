import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { handleItlWebhook } from "./handler"

/** Browser GET should not advertise this webhook. */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  return res.status(404).json({ message: "Not found" })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return handleItlWebhook(req, res)
}

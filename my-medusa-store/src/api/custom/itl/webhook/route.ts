import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { handleItlWebhook } from "./handler"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  return res.json({
    ok: true,
    provider: "itl",
    message: "POST tracking updates to this endpoint",
    example_body: {
      awb: "ITL-DUMMY-...",
      status: "delivered | cash_collected | ndr | rto_initiated | rto_in_transit | rto_delivered",
      reason: "customer_not_available | customer_refused (optional, for NDR/RTO)",
    },
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return handleItlWebhook(req, res)
}

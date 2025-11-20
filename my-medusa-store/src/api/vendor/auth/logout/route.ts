import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"

export async function POST(_req: MedusaRequest, res: MedusaResponse) {
  return res.sendStatus(204)
}



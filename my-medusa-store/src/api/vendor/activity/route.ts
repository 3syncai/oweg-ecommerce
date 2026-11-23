import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { checkRateLimit } from "../../../lib/simple-rate-limit"

// Authenticated vendor middleware records successful foreground navigation.
export function POST(req: MedusaRequest, res: MedusaResponse) {
  const actor = (req as MedusaRequest & {vendor_auth?:{sub:string}}).vendor_auth?.sub
  if (!actor) return res.sendStatus(401)
  const rate = checkRateLimit({key:"vendor-page-activity:"+actor,limit:30,windowMs:60000})
  if (!rate.allowed) return res.set("Retry-After",String(rate.retryAfterSec)).sendStatus(429)
  return res.status(204).end()
}

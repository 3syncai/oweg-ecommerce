import { timingSafeEqual } from "node:crypto"
import type { MedusaRequest } from "@medusajs/framework/http"

type Provider = "itl" | "shiprocket"
type AuthError = { status: 401 | 503; message: string }

/** Missing configuration never authenticates a shipment-state mutation. */
export function shippingWebhookAuthError(req: Pick<MedusaRequest, "headers">, provider: Provider): AuthError | null {
  const secret = process.env[provider === "itl" ? "ITL_WEBHOOK_SECRET" : "SHIPROCKET_WEBHOOK_SECRET"]?.trim()
  if (!secret) return { status: 503, message: "Shipping webhook secret not configured" }

  const provided = req.headers["x-api-key"] || req.headers[`x-${provider}-webhook-secret`] || req.headers[`x-${provider}-signature`]
  if (typeof provided !== "string") return { status: 401, message: "Unauthorized" }
  const expected = Buffer.from(secret)
  const actual = Buffer.from(provided.trim())
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { status: 401, message: "Unauthorized" }
  }
  return null
}

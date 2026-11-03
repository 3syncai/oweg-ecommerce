import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { setAllowlistedCors } from "../../../../lib/store-cors-allowlist"
import { issueVendorSignupUploadToken } from "../../../../lib/vendor-signup-upload-token"

/** Simple per-IP rate limit for signup upload session minting. */
const hits = new Map<string, { count: number; resetAt: number }>()

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const row = hits.get(ip)
  if (!row || row.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (row.count >= 10) return false
  row.count += 1
  return true
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  setAllowlistedCors(res, req as { headers?: { origin?: string } })
  return res.status(200).end()
}

/**
 * POST /store/vendor/upload-session
 * Issues a short-lived token required for unauthenticated signup document uploads.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  setAllowlistedCors(res, req as { headers?: { origin?: string } })
  const ip =
    String((req.headers as any)["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    String((req as any).ip || "unknown")
  if (!rateLimit(ip)) {
    return res.status(429).json({ message: "Too many upload session requests. Try again shortly." })
  }
  try {
    const issued = issueVendorSignupUploadToken()
    return res.json(issued)
  } catch (error: any) {
    return res.status(503).json({
      message: error?.message || "Upload sessions unavailable",
    })
  }
}

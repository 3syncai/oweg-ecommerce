import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedStoreCustomer, verifyInternalApiSecret } from "@/lib/store-customer-auth"

/** Client IDs are assertions to check, never credentials or a source of identity. */
export async function authorizeReferralCustomer(
  req: NextRequest,
  claimedIds: unknown[] = [],
  allowAnonymous = false
) {
  const assertions = [req.headers.get("x-customer-id"), ...claimedIds]
  try {
    const customer = await getAuthenticatedStoreCustomer(req)
    if (!customer) {
      if (allowAnonymous && assertions.every((id) => id == null || id === "")) {
        return { customer: null, error: null } as const
      }
      return { customer: null, error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) } as const
    }
    if (assertions.some((id) => id != null && id !== "" && (typeof id !== "string" || id.trim() !== customer.id))) {
      return { customer: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const
    }
    return { customer, error: null } as const
  } catch {
    // A failed session lookup must not fall back to a caller-supplied identity.
    return { customer: null, error: NextResponse.json({ error: "Unable to verify session" }, { status: 503 }) } as const
  }
}

/** Legacy agent dashboards have no verified agent session in this storefront.
 * Only authenticated server-to-server consumers may query them. Never expose
 * INTERNAL_API_SECRET to a browser; public referral codes are not credentials.
 */
export function authorizeReferralService(req: NextRequest) {
  return verifyInternalApiSecret(req)
    ? null
    : NextResponse.json({ error: "Server authentication required" }, { status: 401 })
}

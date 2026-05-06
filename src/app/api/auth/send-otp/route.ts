import { NextRequest } from "next/server"
import { medusaStoreFetch } from "@/lib/medusa-auth"
import { normalizeIndianPhone } from "@/lib/auth/phone"
import { fail, ok } from "@/lib/api/response"
import { log } from "@/lib/api/logger"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { phone?: string } | null
    const normalized = normalizeIndianPhone(body?.phone)
    if (!normalized) {
      return fail("Enter a valid Indian mobile number.", 400, "INVALID_PHONE")
    }

    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }

    const upstream = await medusaStoreFetch("/store/customers/login-otp/request", {
      method: "POST",
      body: JSON.stringify({ phone: normalized.e164 }),
      forwardedHeaders,
    })

    const payload = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      const message =
        (payload as { message?: string; error?: string } | null)?.message ||
        (payload as { message?: string; error?: string } | null)?.error ||
        "Unable to send OTP."
      log("warn", "auth.phone_otp.send.failed", { status: upstream.status })
      return fail(message, upstream.status)
    }

    log("info", "auth.phone_otp.send.success")
    return ok({
      message:
        (payload as { message?: string } | null)?.message ||
        "If an account exists, OTP has been sent.",
    })
  } catch {
    log("error", "auth.phone_otp.send.exception")
    return fail("Something went wrong. Please try again.", 500)
  }
}

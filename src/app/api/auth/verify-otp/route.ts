import { NextRequest, NextResponse } from "next/server"
import {
  appendUpstreamCookies,
  collectSetCookies,
  cookiesToHeader,
  medusaStoreFetch,
} from "@/lib/medusa-auth"
import { normalizeIndianPhone } from "@/lib/auth/phone"
import { fail } from "@/lib/api/response"
import { log } from "@/lib/api/logger"

export const dynamic = "force-dynamic"

const otpRegex = /^\d{4}$/

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { phone?: string; otp?: string } | null
    const normalized = normalizeIndianPhone(body?.phone)
    const otp = body?.otp?.trim()
    if (!normalized) return fail("Enter a valid Indian mobile number.", 400, "INVALID_PHONE")
    if (!otp || !otpRegex.test(otp)) return fail("Enter valid 4-digit OTP.", 400, "INVALID_OTP")

    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }

    const verifyRes = await medusaStoreFetch("/store/customers/login-otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone: normalized.e164, otp }),
      forwardedHeaders,
    })

    const verifyPayload = (await verifyRes.json().catch(() => null)) as
      | { token?: string; message?: string; error?: string }
      | null

    if (!verifyRes.ok || !verifyPayload?.token) {
      const message = verifyPayload?.message || verifyPayload?.error || "Invalid or expired OTP."
      return fail(message, verifyRes.status || 400)
    }

    const sessionRes = await medusaStoreFetch("/auth/session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${verifyPayload.token}`,
      },
      forwardedHeaders,
      skipContentType: true,
    })

    if (!sessionRes.ok) {
      log("warn", "auth.phone_otp.verify.session_failed", { status: sessionRes.status })
      return fail("Unable to start your session.", sessionRes.status)
    }

    const sessionCookies = collectSetCookies(sessionRes.headers)
    const forwardedCookie = cookiesToHeader(sessionCookies)
    if (!forwardedCookie) {
      return fail("Login succeeded, but session cookie was not returned.", 502)
    }

    const meRes = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      forwardedHeaders,
      forwardedCookie,
    })

    if (!meRes.ok) {
      return fail("Unable to fetch your account.", meRes.status)
    }

    const mePayload = await meRes.json().catch(() => null)
    const response = NextResponse.json(
      {
        success: true,
        data: {
          customer: (mePayload as { customer?: unknown } | null)?.customer ?? mePayload,
          message: verifyPayload.message || "Logged in successfully.",
        },
      },
      { status: 200 }
    )
    appendUpstreamCookies(response, sessionRes)
    log("info", "auth.phone_otp.verify.success")
    return response
  } catch {
    log("error", "auth.phone_otp.verify.exception")
    return fail("Something went wrong. Please try again.", 500)
  }
}

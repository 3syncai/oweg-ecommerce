import { NextRequest, NextResponse } from "next/server"
import { extractErrorPayload, medusaStoreFetch } from "@/lib/medusa-auth"
import {
  isPasswordResetRequired,
  passwordResetRequiredPayload,
} from "../../_lib/password-recovery"

export const dynamic = "force-dynamic"

const indianPhoneRegex = /^[6-9]\d{9}$/

function normalizeIndianPhone(input?: string) {
  if (!input) return null
  const digits = input.replace(/\D/g, "")
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits
  if (!indianPhoneRegex.test(local)) return null
  return `91${local}`
}

export async function POST(req: NextRequest) {
  try {
    const { email, phone } = (await req.json()) as { email?: string; phone?: string }
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }

    const normalizedEmail = email?.trim().toLowerCase()
    const normalizedPhone = normalizeIndianPhone(phone)
    const isEmailFlow = Boolean(normalizedEmail)
    const isPhoneFlow = Boolean(normalizedPhone)
    if (!isEmailFlow && !isPhoneFlow) {
      return NextResponse.json({ error: "Enter a valid email or Indian mobile number." }, { status: 400 })
    }

    const recoveryRequired = normalizedEmail ? await isPasswordResetRequired(normalizedEmail) : false
    if (recoveryRequired && normalizedEmail) {
      return NextResponse.json(passwordResetRequiredPayload(), { status: 401 })
    }

    const upstream = await medusaStoreFetch("/store/customers/login-otp/request", {
      method: "POST",
      body: JSON.stringify(
        normalizedEmail ? { email: normalizedEmail } : { phone: normalizedPhone }
      ),
      forwardedHeaders,
    })

    if (!upstream.ok) {
      const payload = await extractErrorPayload(upstream)
      const message =
        typeof payload === "object" && payload
          ? (payload?.message as string | undefined) || (payload?.error as string | undefined)
          : null

      if ((upstream.status === 400 || upstream.status === 404 || upstream.status === 429) && message) {
        return NextResponse.json({ error: message }, { status: upstream.status })
      }

      return NextResponse.json(
        {
          success: true,
          message: normalizedPhone
            ? "If an account exists, an OTP has been sent to your mobile number."
            : "If an account exists, an OTP has been sent to your email.",
        },
        { status: 200 }
      )
    }

    const data = await upstream.json().catch(() => null)
    return NextResponse.json(
      {
        success: true,
        message:
          (data as { message?: string } | null)?.message ||
          (normalizedPhone
            ? "If an account exists, an OTP has been sent to your mobile number."
            : "If an account exists, an OTP has been sent to your email."),
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}

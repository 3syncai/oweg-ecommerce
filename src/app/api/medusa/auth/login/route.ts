import { NextRequest, NextResponse } from "next/server"
import { Pool } from "pg"
import {
  appendUpstreamCookies,
  collectSetCookies,
  cookiesToHeader,
  extractErrorPayload,
  medusaStoreFetch,
} from "@/lib/medusa-auth"
import {
  isPasswordResetRequired,
  passwordResetRequiredPayload,
} from "../_lib/password-recovery"

export const dynamic = "force-dynamic"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const indianPhoneRegex = /^[6-9]\d{9}$/
const AUTH_PROVIDER_PATH = "/auth/customer/emailpass"
const DATABASE_URL = process.env.DATABASE_URL?.trim() || ""

let sharedPool: Pool | null = null

function getPool() {
  if (!DATABASE_URL) return null
  if (!sharedPool) {
    sharedPool = new Pool({ connectionString: DATABASE_URL })
  }
  return sharedPool
}

type LoginBody = {
  identifier?: string
  password?: string
}

function normalizeIndianPhone(input: string) {
  const digits = input.replace(/\D/g, "")
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits
  if (!indianPhoneRegex.test(local)) return null
  return {
    local,
    withCountry: `91${local}`,
    plusCountry: `+91${local}`,
  }
}

async function resolveEmailFromIdentifier(identifier?: string | null): Promise<string | null> {
  if (!identifier) return null
  const trimmed = identifier.trim().toLowerCase()
  if (emailRegex.test(trimmed)) return trimmed

  const phone = normalizeIndianPhone(trimmed)
  if (!phone) return null

  const pool = getPool()
  if (!pool) return null

  try {
    const { rows } = await pool.query(
      `
        SELECT email
        FROM customer
        WHERE deleted_at IS NULL
          AND COALESCE(has_account, false) = true
          AND phone = ANY($1::text[])
        LIMIT 1
      `,
      [[phone.local, phone.withCountry, phone.plusCountry]]
    )

    const email = rows[0]?.email
    return typeof email === "string" ? email.trim().toLowerCase() : null
  } catch {
    return null
  }
}

function toErrorMessage(errorPayload: unknown, fallback: string) {
  if (typeof errorPayload === "string" && errorPayload) return errorPayload
  if (typeof errorPayload === "object" && errorPayload) {
    const payload = errorPayload as Record<string, unknown>
    if (typeof payload.error === "string" && payload.error) return payload.error
    if (typeof payload.message === "string" && payload.message) return payload.message
  }
  return fallback
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LoginBody
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    const email = await resolveEmailFromIdentifier(body.identifier)
    const password = body.password?.trim() || ""

    if (!email) {
      return NextResponse.json(
        { error: "Please enter a registered email or mobile number." },
        { status: 400 }
      )
    }
    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 })
    }

    const loginRes = await medusaStoreFetch(AUTH_PROVIDER_PATH, {
      method: "POST",
      body: JSON.stringify({ email, password }),
      forwardedHeaders,
    })

    if (!loginRes.ok) {
      const recoveryRequired = await isPasswordResetRequired(email)
      if (recoveryRequired) {
        return NextResponse.json(passwordResetRequiredPayload(), { status: 401 })
      }

      const errorPayload = await extractErrorPayload(loginRes)
      const message = toErrorMessage(
        errorPayload,
        "Unable to sign in. Please check your credentials."
      )
      return NextResponse.json({ error: message }, { status: loginRes.status })
    }

    const loginPayload = (await loginRes.json()) as { token?: string }
    if (!loginPayload?.token) {
      return NextResponse.json(
        { error: "Unable to sign in. Please try again." },
        { status: 502 }
      )
    }

    const sessionRes = await medusaStoreFetch("/auth/session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${loginPayload.token}`,
      },
      forwardedHeaders,
      skipContentType: true,
    })

    if (!sessionRes.ok) {
      const errorPayload = await extractErrorPayload(sessionRes)
      const message = toErrorMessage(errorPayload, "Unable to start your session.")
      return NextResponse.json({ error: message }, { status: sessionRes.status })
    }

    const sessionCookies = collectSetCookies(sessionRes.headers)
    const forwardedCookie = cookiesToHeader(sessionCookies)

    if (!forwardedCookie) {
      return NextResponse.json(
        { error: "Login succeeded, but session cookie was not returned." },
        { status: 502 }
      )
    }

    const meRes = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      forwardedHeaders,
      forwardedCookie,
    })

    if (!meRes.ok) {
      const errorPayload = await extractErrorPayload(meRes)
      const message = toErrorMessage(errorPayload, "Unable to fetch your account.")
      return NextResponse.json({ error: message }, { status: meRes.status })
    }

    const mePayload = await meRes.json()
    const response = NextResponse.json(
      { customer: mePayload?.customer ?? mePayload },
      { status: 200 }
    )
    appendUpstreamCookies(response, sessionRes)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sign in."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

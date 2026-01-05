import { NextRequest, NextResponse } from "next/server"
import {
  appendUpstreamCookies,
  collectSetCookies,
  cookiesToHeader,
  extractErrorPayload,
  medusaStoreFetch,
} from "@/lib/medusa-auth"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phoneRegex = /^\+?[0-9]{7,15}$/
const AUTH_PROVIDER_PATH = "/auth/customer/emailpass"

type RegisterBody = {
  firstName?: string
  lastName?: string
  email?: string
  mobile?: string
  password?: string
  referral?: string
  gst?: string
  company?: string
  userType?: "individual" | "business"
  newsletter?: boolean
}

function sanitize(value?: string | null) {
  return value?.trim() || undefined
}

function buildMetadata(body: RegisterBody) {
  const metadata: Record<string, unknown> = {}
  if (body.referral) metadata.referral_code = body.referral.trim()
  if (body.company) metadata.company_name = body.company.trim()
  if (body.gst) metadata.gst_number = body.gst.trim()
  if (body.userType) metadata.user_type = body.userType
  if (typeof body.newsletter === "boolean") metadata.newsletter_opt_in = body.newsletter
  // Initialize wallet with 0 coins for rewards system
  metadata.wallet_coins = 0
  return metadata
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
    const body = (await req.json()) as RegisterBody
    const forwardedHeaders = {
      origin: req.headers.get("origin") ?? undefined,
      referer: req.headers.get("referer") ?? undefined,
      "user-agent": req.headers.get("user-agent") ?? undefined,
    }
    const first_name = sanitize(body.firstName)
    const last_name = sanitize(body.lastName)
    const email = sanitize(body.email)?.toLowerCase()
    const phone = sanitize(body.mobile)
    const password = sanitize(body.password)

    if (!first_name || !last_name || !email || !password || !phone) {
      return NextResponse.json(
        { error: "First name, last name, mobile number, email and password are required." },
        { status: 400 }
      )
    }
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 })
    }
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: "Mobile number must include only digits (use country code if outside India)." },
        { status: 400 }
      )
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      )
    }

    const metadata = buildMetadata(body)
    const payload: Record<string, unknown> = {
      first_name,
      last_name,
      email,
      phone,
    }
    if (Object.keys(metadata).length > 0) {
      payload.metadata = metadata
    }

    const registerAuthRes = await medusaStoreFetch(`${AUTH_PROVIDER_PATH}/register`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
      forwardedHeaders,
    })

    if (!registerAuthRes.ok) {
      const errorPayload = await extractErrorPayload(registerAuthRes)
      console.error("medusa register auth failed", registerAuthRes.status, errorPayload)
      const message = toErrorMessage(errorPayload, "Unable to start registration. Please try again.")
      return NextResponse.json({ error: message }, { status: registerAuthRes.status })
    }

    const registerAuthData = (await registerAuthRes.json()) as { token?: string }
    if (!registerAuthData?.token) {
      console.error("medusa register auth missing token")
      return NextResponse.json(
        { error: "Unable to register right now. Please try again." },
        { status: 502 }
      )
    }

    const registerRes = await medusaStoreFetch("/store/customers", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${registerAuthData.token}`,
      },
      forwardedHeaders,
    })

    if (!registerRes.ok) {
      const errorPayload = await extractErrorPayload(registerRes)
      console.error("medusa register failed", registerRes.status, errorPayload)
      const message = toErrorMessage(errorPayload, "Unable to register. Please try again.")
      return NextResponse.json({ error: message }, { status: registerRes.status })
    }

    const registeredPayload = await registerRes.json()

    const loginRes = await medusaStoreFetch(AUTH_PROVIDER_PATH, {
      method: "POST",
      body: JSON.stringify({ email, password }),
      forwardedHeaders,
    })

    if (!loginRes.ok) {
      const errorPayload = await extractErrorPayload(loginRes)
      const message = toErrorMessage(
        errorPayload,
        "Account created, but sign-in failed. Please try logging in."
      )
      return NextResponse.json(
        {
          customer: registeredPayload?.customer || registeredPayload,
          requiresLogin: true,
          error: message,
        },
        { status: 201 }
      )
    }

    const loginPayload = (await loginRes.json()) as { token?: string }
    if (!loginPayload?.token) {
      console.error("medusa login missing token after registration")
      return NextResponse.json(
        {
          customer: registeredPayload?.customer || registeredPayload,
          requiresLogin: true,
        },
        { status: 201 }
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

    const sessionCookies = collectSetCookies(sessionRes.headers)
    const forwardedCookie = cookiesToHeader(sessionCookies)

    if (!sessionRes.ok) {
      const errorPayload = await extractErrorPayload(sessionRes)
      console.error("medusa session creation failed", sessionRes.status, errorPayload)
      const message = toErrorMessage(
        errorPayload,
        "Account created, but automatic login failed. Please sign in."
      )
      return NextResponse.json(
        {
          customer: registeredPayload?.customer || registeredPayload,
          requiresLogin: true,
          error: message,
        },
        { status: 201 }
      )
    }

    // Ensure referral code (if provided) is persisted on customer metadata
    const referralCode = metadata.referral_code as string | undefined
    if (referralCode) {
      try {
        await medusaStoreFetch("/store/customers/me", {
          method: "POST",
          headers: forwardedCookie ? { Cookie: forwardedCookie } : undefined,
          forwardedHeaders,
          body: JSON.stringify({ metadata: { referral_code: referralCode } }),
        })
      } catch (err) {
        console.warn("Failed to persist referral_code on customer", err)
      }
    }

    let customer = registeredPayload?.customer || registeredPayload
    if (forwardedCookie) {
      const meRes = await medusaStoreFetch("/store/customers/me", {
        method: "GET",
        forwardedHeaders,
        forwardedCookie,
      })
      if (meRes.ok) {
        const mePayload = await meRes.json()
        customer = mePayload?.customer || mePayload
      } else {
        console.warn("registered but failed to fetch /store/customers/me", meRes.status)
      }
    }

    // Insert into customer_referral table if referral code provided
    if (body.referral && customer?.id) {
      console.error('[[ REGISTRATION ]] Saving referral code:', body.referral, 'for customer:', customer.id)

      if (!process.env.DATABASE_URL) {
        console.error('[[ REGISTRATION ERROR ]] DATABASE_URL is missing in API route environment!')
      } else {
        try {
          const pool = new Pool({ connectionString: process.env.DATABASE_URL }) // Create new pool for this request to be safe

          await pool.query(
            `INSERT INTO customer_referral (customer_id, referral_code, created_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (customer_id) DO UPDATE 
             SET referral_code = EXCLUDED.referral_code`, // Update if exists to be safe
            [customer.id, body.referral.trim()]
          )

          // Also track in affiliate_referrals table for affiliate dashboard
          const affiliateCode = body.referral.trim()
          const customerEmail = body.email || customer.email
          const customerName = `${body.firstName || ''} ${body.lastName || ''}`.trim()

          // Find affiliate_user_id if exists
          const affiliateResult = await pool.query(
            `SELECT id FROM affiliate_user WHERE refer_code = $1`,
            [affiliateCode]
          )
          const affiliateUserId = affiliateResult.rows[0]?.id || null

          await pool.query(
            `INSERT INTO affiliate_referrals 
               (affiliate_code, affiliate_user_id, customer_id, customer_email, customer_name)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (affiliate_code, customer_id) DO UPDATE 
             SET customer_email = EXCLUDED.customer_email,
                 customer_name = EXCLUDED.customer_name`,
            [affiliateCode, affiliateUserId, customer.id, customerEmail, customerName]
          )

          console.error('[[ REGISTRATION ]] Tracked affiliate referral for:', affiliateCode)

          await pool.end()
          console.error('[[ REGISTRATION SUCCESS ]] Saved referral code to database automatically.')
        } catch (dbError) {
          console.error('[[ REGISTRATION ERROR ]] Failed to save referral code to DB:', dbError)
        }
      }
    }

    const response = NextResponse.json(
      {
        ...((customer && { customer }) || {}),
      },
      { status: 201 }
    )
    appendUpstreamCookies(response, sessionRes)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

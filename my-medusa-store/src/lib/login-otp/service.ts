import { randomUUID } from "node:crypto"

import {
  ContainerRegistrationKeys,
  Modules,
  generateJwtToken,
} from "@medusajs/framework/utils"
import type { PoolClient } from "pg"

import { hasLoginOtpMailerConfig, hasMsg91Config, loginOtpConfig } from "./config"
import {
  createLookupHash,
  getClientIp,
  normalizeIndianPhone,
  hashOtp,
  createOtp,
  normalizeEmail,
  normalizeOtp,
  normalizePhoneOtp,
} from "./crypto"
import { getLoginOtpPool } from "./db"
import { sendLoginOtpEmail } from "./mailer"
import { sendMsg91Otp, verifyMsg91Otp } from "./msg91"

const GENERIC_REQUEST_MESSAGE =
  "If an account exists, an OTP has been sent to your email."
const GENERIC_VERIFY_MESSAGE = "Invalid or expired OTP."

type CustomerRecord = {
  id: string
  email?: string | null
  has_account?: boolean | null
  metadata?: Record<string, unknown> | null
}

type AuthIdentityRecord = {
  id: string
  app_metadata?: Record<string, unknown> | null
  provider_identities?: Array<{
    provider?: string
    user_metadata?: Record<string, unknown> | null
  }>
}

type LoginOtpRequestContext = {
  scope: {
    resolve: (key: string) => unknown
  }
  headers: Record<string, string | string[] | undefined>
}

type AuditEventType =
  | "request"
  | "request_rate_limited"
  | "request_email_sent"
  | "request_email_send_failed"
  | "request_skipped_missing_customer"
  | "request_skipped_unverified"
  | "verify"
  | "verify_rate_limited"
  | "verify_invalid"
  | "verify_expired"
  | "verify_success"
  | "phone_request"
  | "phone_request_rate_limited"
  | "phone_request_cooldown"
  | "phone_request_send_failed"
  | "phone_request_skipped_unregistered"
  | "phone_verify"
  | "phone_verify_rate_limited"
  | "phone_verify_invalid"
  | "phone_verify_success"

type VerifyResult =
  | {
      ok: true
      status: 200
      message: string
      token: string
    }
  | {
      ok: false
      status: number
      message: string
    }

function isEmailVerified(customer: CustomerRecord | null) {
  if (!customer) {
    return false
  }

  const metadata = customer.metadata || {}
  return (
    metadata.email_verified === true ||
    metadata.is_email_verified === true ||
    metadata.verified === true
  )
}

function getWindowInterval(minutes: number) {
  return `${minutes} minutes`
}

function getAuditInterval(days: number) {
  return `${days} days`
}

function getOtpRetentionInterval(hours: number) {
  return `${hours} hours`
}

async function recordAuditEvent(input: {
  eventType: AuditEventType
  emailHash?: string | null
  ipHash?: string | null
  otpHash?: string | null
  customerId?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const pool = getLoginOtpPool()
  await pool.query(
    `
      INSERT INTO customer_login_otp_audit (
        id,
        event_type,
        email_hash,
        ip_hash,
        otp_hash,
        customer_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      randomUUID(),
      input.eventType,
      input.emailHash ?? null,
      input.ipHash ?? null,
      input.otpHash ?? null,
      input.customerId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  )
}

async function maybeRunCleanup() {
  if (Math.random() > 0.05) {
    return
  }

  const pool = getLoginOtpPool()

  await pool.query(
    `
      DELETE FROM customer_login_otp_audit
      WHERE created_at < NOW() - $1::interval
    `,
    [getAuditInterval(loginOtpConfig.auditRetentionDays)]
  )

  await pool.query(
    `
      DELETE FROM customer_login_otp_code
      WHERE created_at < NOW() - $1::interval
        AND (
          used_at IS NOT NULL
          OR invalidated_at IS NOT NULL
          OR expires_at < NOW()
        )
    `,
    [getOtpRetentionInterval(loginOtpConfig.otpRetentionHours)]
  )
}

async function getRequestRateCounts(emailHash: string, ipHash: string | null) {
  const pool = getLoginOtpPool()
  const { rows } = await pool.query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN email_hash = $1 THEN 1 ELSE 0 END), 0)::int AS email_count,
        COALESCE(SUM(CASE WHEN ip_hash = $2 THEN 1 ELSE 0 END), 0)::int AS ip_count
      FROM customer_login_otp_audit
      WHERE event_type = 'request'
        AND created_at >= NOW() - $3::interval
    `,
    [emailHash, ipHash, getWindowInterval(loginOtpConfig.requestWindowMinutes)]
  )

  return {
    emailCount: Number(rows[0]?.email_count || 0),
    ipCount: Number(rows[0]?.ip_count || 0),
  }
}

async function getVerifyAttemptCount(ipHash: string | null) {
  if (!ipHash) {
    return 0
  }

  const pool = getLoginOtpPool()
  const { rows } = await pool.query(
    `
      SELECT COUNT(*)::int AS attempt_count
      FROM customer_login_otp_audit
      WHERE event_type = 'verify'
        AND ip_hash = $1
        AND created_at >= NOW() - $2::interval
    `,
    [ipHash, getWindowInterval(loginOtpConfig.verifyWindowMinutes)]
  )

  return Number(rows[0]?.attempt_count || 0)
}

async function findCustomerByEmail(req: LoginOtpRequestContext, email: string) {
  const customerService = req.scope.resolve(Modules.CUSTOMER) as {
    listCustomers: (filters: Record<string, unknown>) => Promise<CustomerRecord[]>
  }

  const customers = await customerService.listCustomers({
    email,
    has_account: true,
  })

  return customers?.[0] ?? null
}

async function findAuthIdentityByEmail(email: string) {
  const pool = getLoginOtpPool()
  const { rows } = await pool.query(
    `
      SELECT
        ai.id,
        ai.app_metadata,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'provider', pi.provider,
                'user_metadata', pi.user_metadata
              )
            ),
            '[]'::json
          )
          FROM provider_identity pi
          WHERE pi.auth_identity_id = ai.id
            AND pi.deleted_at IS NULL
        ) AS provider_identities
      FROM provider_identity p
      INNER JOIN auth_identity ai ON ai.id = p.auth_identity_id
      WHERE p.provider = 'emailpass'
        AND p.entity_id = $1
        AND p.deleted_at IS NULL
        AND ai.deleted_at IS NULL
      LIMIT 1
    `,
    [email]
  )

  const row = rows[0]
  if (!row?.id) {
    return null
  }

  return {
    id: String(row.id),
    app_metadata: (row.app_metadata || null) as Record<string, unknown> | null,
    provider_identities: Array.isArray(row.provider_identities)
      ? (row.provider_identities as AuthIdentityRecord["provider_identities"])
      : [],
  } satisfies AuthIdentityRecord
}

async function invalidateActiveOtpForCustomer(client: PoolClient, customerId: string) {
  await client.query(
    `
      UPDATE customer_login_otp_code
      SET invalidated_at = NOW(), updated_at = NOW()
      WHERE customer_id = $1
        AND used_at IS NULL
        AND invalidated_at IS NULL
    `,
    [customerId]
  )
}

function getJwtConfig(req: LoginOtpRequestContext) {
  const configModule = req.scope.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  ) as {
    projectConfig?: {
      http?: {
        jwtSecret?: string
        jwtExpiresIn?: string | number
        jwtOptions?: Record<string, unknown>
      }
    }
  }

  const jwtSecret =
    configModule.projectConfig?.http?.jwtSecret ||
    process.env.JWT_SECRET ||
    ""

  if (!jwtSecret) {
    throw new Error("JWT secret is not configured")
  }

  return {
    secret: jwtSecret,
    expiresIn: configModule.projectConfig?.http?.jwtExpiresIn,
    options: configModule.projectConfig?.http?.jwtOptions,
  }
}

function generateCustomerAuthToken(input: {
  authIdentity: AuthIdentityRecord
  authProvider: string
  secret: string
  expiresIn?: string | number
  options?: Record<string, unknown>
}) {
  const entityId = input.authIdentity?.app_metadata?.customer_id
  const providerIdentity = input.authIdentity.provider_identities?.find(
    (identity) => identity?.provider === input.authProvider
  )

  return generateJwtToken(
    {
      actor_id: typeof entityId === "string" ? entityId : "",
      actor_type: "customer",
      auth_identity_id: input.authIdentity?.id ?? "",
      app_metadata: {
        customer_id: entityId,
      },
      user_metadata: providerIdentity?.user_metadata ?? {},
    },
    {
      secret: input.secret,
      expiresIn: input.expiresIn,
      jwtOptions: input.options,
    }
  )
}

async function findCustomerByPhone(_req: LoginOtpRequestContext, phoneE164: string) {
  const pool = getLoginOtpPool()
  const local = phoneE164.startsWith("91") && phoneE164.length === 12 ? phoneE164.slice(2) : phoneE164
  const plusFormat = `+${phoneE164}`

  const { rows } = await pool.query(
    `
      SELECT id, email, has_account, metadata
      FROM customer
      WHERE deleted_at IS NULL
        AND COALESCE(has_account, false) = true
        AND phone = ANY($1::text[])
      LIMIT 1
    `,
    [[phoneE164, local, plusFormat]]
  )

  const row = rows[0]
  if (!row?.id) {
    return null
  }

  return {
    id: String(row.id),
    email: typeof row.email === "string" ? row.email : null,
    has_account: Boolean(row.has_account),
    metadata: (row.metadata || null) as Record<string, unknown> | null,
  } satisfies CustomerRecord
}

export function getGenericLoginOtpRequestMessage() {
  return GENERIC_REQUEST_MESSAGE
}

export function getGenericLoginOtpVerifyMessage() {
  return GENERIC_VERIFY_MESSAGE
}

export async function requestLoginOtp(
  req: LoginOtpRequestContext,
  emailInput: unknown
) {
  await maybeRunCleanup()

  const email = normalizeEmail(emailInput)
  if (!email) {
    return {
      ok: false as const,
      status: 400,
      message: "Enter a valid email address.",
    }
  }

  const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>)
  const emailHash = createLookupHash("email", email)
  const ipHash = ip ? createLookupHash("ip", ip) : null

  await recordAuditEvent({
    eventType: "request",
    emailHash,
    ipHash,
  })

  const counts = await getRequestRateCounts(emailHash, ipHash)
  if (
    counts.emailCount > loginOtpConfig.maxRequestsPerEmail ||
    counts.ipCount > loginOtpConfig.maxRequestsPerIp
  ) {
    await recordAuditEvent({
      eventType: "request_rate_limited",
      emailHash,
      ipHash,
    })

    return {
      ok: true as const,
      status: 200,
      message: GENERIC_REQUEST_MESSAGE,
    }
  }

  const customer = await findCustomerByEmail(req, email)
  const authIdentity = customer?.id ? await findAuthIdentityByEmail(email) : null
  if (!customer?.id || !customer.email || !authIdentity?.id) {
    await recordAuditEvent({
      eventType: "request_skipped_missing_customer",
      emailHash,
      ipHash,
    })

    return {
      ok: true as const,
      status: 200,
      message: GENERIC_REQUEST_MESSAGE,
    }
  }

  if (loginOtpConfig.requireVerifiedEmail && !isEmailVerified(customer)) {
    await recordAuditEvent({
      eventType: "request_skipped_unverified",
      emailHash,
      ipHash,
      customerId: customer.id,
    })

    return {
      ok: true as const,
      status: 200,
      message: GENERIC_REQUEST_MESSAGE,
    }
  }

  if (!hasLoginOtpMailerConfig()) {
    await recordAuditEvent({
      eventType: "request_email_send_failed",
      emailHash,
      ipHash,
      customerId: customer.id,
      metadata: {
        reason: "missing_configuration",
      },
    })

    return {
      ok: true as const,
      status: 200,
      message: GENERIC_REQUEST_MESSAGE,
    }
  }

  const pool = getLoginOtpPool()
  const client = await pool.connect()
  const otp = createOtp()
  const otpHash = hashOtp(otp)
  const expiresAt = new Date(Date.now() + loginOtpConfig.otpTtlMinutes * 60 * 1000)

  try {
    await client.query("BEGIN")
    await invalidateActiveOtpForCustomer(client, customer.id)
    await client.query(
      `
        INSERT INTO customer_login_otp_code (
          id,
          customer_id,
          auth_identity_id,
          otp_hash,
          email_hash,
          request_ip_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        randomUUID(),
        customer.id,
        authIdentity.id,
        otpHash,
        emailHash,
        ipHash,
        expiresAt,
      ]
    )
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  try {
    await sendLoginOtpEmail({
      to: customer.email,
      otp,
      expiresInMinutes: loginOtpConfig.otpTtlMinutes,
    })

    await recordAuditEvent({
      eventType: "request_email_sent",
      emailHash,
      ipHash,
      otpHash,
      customerId: customer.id,
    })
  } catch {
    await pool.query(
      `
        UPDATE customer_login_otp_code
        SET invalidated_at = NOW(), updated_at = NOW()
        WHERE otp_hash = $1
      `,
      [otpHash]
    )

    await recordAuditEvent({
      eventType: "request_email_send_failed",
      emailHash,
      ipHash,
      otpHash,
      customerId: customer.id,
      metadata: {
        reason: "smtp_send_failed",
      },
    })
  }

  return {
    ok: true as const,
    status: 200,
    message: GENERIC_REQUEST_MESSAGE,
  }
}

export async function verifyLoginOtp(
  req: LoginOtpRequestContext,
  input: { email: unknown; otp: unknown }
): Promise<VerifyResult> {
  const email = normalizeEmail(input.email)
  const otp = normalizeOtp(input.otp)

  if (!email || !otp) {
    return {
      ok: false,
      status: 400,
      message: GENERIC_VERIFY_MESSAGE,
    }
  }

  const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>)
  const ipHash = ip ? createLookupHash("ip", ip) : null
  const emailHash = createLookupHash("email", email)
  const otpHash = hashOtp(otp)

  await recordAuditEvent({
    eventType: "verify",
    ipHash,
    emailHash,
    otpHash,
  })

  const verifyAttemptCount = await getVerifyAttemptCount(ipHash)
  if (verifyAttemptCount > loginOtpConfig.maxVerifyAttemptsPerIp) {
    await recordAuditEvent({
      eventType: "verify_rate_limited",
      ipHash,
      emailHash,
      otpHash,
    })

    return {
      ok: false,
      status: 429,
      message: GENERIC_VERIFY_MESSAGE,
    }
  }

  const pool = getLoginOtpPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const { rows } = await client.query(
      `
        SELECT
          id,
          customer_id,
          auth_identity_id,
          otp_hash,
          attempt_count,
          expires_at,
          used_at,
          invalidated_at
        FROM customer_login_otp_code
        WHERE email_hash = $1
          AND used_at IS NULL
          AND invalidated_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [emailHash]
    )

    const otpRecord = rows[0]
    if (!otpRecord?.id) {
      await client.query("ROLLBACK")
      await recordAuditEvent({
        eventType: "verify_invalid",
        ipHash,
        emailHash,
        otpHash,
      })

      return {
        ok: false,
        status: 400,
        message: GENERIC_VERIFY_MESSAGE,
      }
    }

    const expiresAt = new Date(otpRecord.expires_at)
    if (
      otpRecord.used_at ||
      otpRecord.invalidated_at ||
      expiresAt.getTime() <= Date.now()
    ) {
      await client.query(
        `
          UPDATE customer_login_otp_code
          SET invalidated_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `,
        [otpRecord.id]
      )
      await client.query("COMMIT")
      await recordAuditEvent({
        eventType: "verify_expired",
        ipHash,
        emailHash,
        otpHash,
        customerId: String(otpRecord.customer_id),
      })

      return {
        ok: false,
        status: 400,
        message: GENERIC_VERIFY_MESSAGE,
      }
    }

    if (!safeEqualHex(String(otpRecord.otp_hash), otpHash)) {
      const nextAttemptCount = Number(otpRecord.attempt_count || 0) + 1
      const shouldInvalidate = nextAttemptCount >= loginOtpConfig.maxVerifyAttemptsPerCode
      await client.query(
        `
          UPDATE customer_login_otp_code
          SET
            attempt_count = $2,
            last_attempt_at = NOW(),
            invalidated_at = CASE WHEN $3::boolean THEN NOW() ELSE invalidated_at END,
            updated_at = NOW()
          WHERE id = $1
        `,
        [otpRecord.id, nextAttemptCount, shouldInvalidate]
      )
      await client.query("COMMIT")
      await recordAuditEvent({
        eventType: "verify_invalid",
        ipHash,
        emailHash,
        otpHash,
        customerId: String(otpRecord.customer_id),
        metadata: {
          attempt_count: nextAttemptCount,
        },
      })

      return {
        ok: false,
        status: 400,
        message: GENERIC_VERIFY_MESSAGE,
      }
    }

    const authService = req.scope.resolve(Modules.AUTH) as {
      retrieveAuthIdentity: (id: string) => Promise<AuthIdentityRecord | null>
    }
    const authIdentity = await authService.retrieveAuthIdentity(
      String(otpRecord.auth_identity_id)
    )

    if (!authIdentity?.id) {
      await client.query("ROLLBACK")
      return {
        ok: false,
        status: 400,
        message: GENERIC_VERIFY_MESSAGE,
      }
    }

    const jwtConfig = getJwtConfig(req)
    const token = generateCustomerAuthToken({
      authIdentity,
      authProvider: "emailpass",
      secret: jwtConfig.secret,
      expiresIn: jwtConfig.expiresIn,
      options: jwtConfig.options,
    })

    await client.query(
      `
        UPDATE customer_login_otp_code
        SET used_at = NOW(), invalidated_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `,
      [otpRecord.id]
    )

    await client.query(
      `
        UPDATE customer_login_otp_code
        SET invalidated_at = NOW(), updated_at = NOW()
        WHERE customer_id = $1
          AND id <> $2
          AND used_at IS NULL
          AND invalidated_at IS NULL
      `,
      [otpRecord.customer_id, otpRecord.id]
    )

    await client.query("COMMIT")
    await recordAuditEvent({
      eventType: "verify_success",
      ipHash,
      emailHash,
      otpHash,
      customerId: String(otpRecord.customer_id),
    })

    return {
      ok: true,
      status: 200,
      message: "OTP verified successfully.",
      token,
    }
  } catch {
    await client.query("ROLLBACK")
    return {
      ok: false,
      status: 500,
      message: "Something went wrong. Please try again.",
    }
  } finally {
    client.release()
  }
}

async function getPhoneRequestRateCounts(phoneHash: string, ipHash: string | null) {
  const pool = getLoginOtpPool()
  const { rows } = await pool.query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN email_hash = $1 THEN 1 ELSE 0 END), 0)::int AS phone_count,
        COALESCE(SUM(CASE WHEN ip_hash = $2 THEN 1 ELSE 0 END), 0)::int AS ip_count
      FROM customer_login_otp_audit
      WHERE event_type = 'phone_request'
        AND created_at >= NOW() - $3::interval
    `,
    [phoneHash, ipHash, getWindowInterval(loginOtpConfig.phoneRequestWindowMinutes)]
  )

  return {
    phoneCount: Number(rows[0]?.phone_count || 0),
    ipCount: Number(rows[0]?.ip_count || 0),
  }
}

async function getPhoneVerifyAttemptCount(ipHash: string | null, phoneHash: string) {
  if (!ipHash) return 0

  const pool = getLoginOtpPool()
  const { rows } = await pool.query(
    `
      SELECT COUNT(*)::int AS attempt_count
      FROM customer_login_otp_audit
      WHERE event_type = 'phone_verify'
        AND ip_hash = $1
        AND email_hash = $2
        AND created_at >= NOW() - $3::interval
    `,
    [ipHash, phoneHash, getWindowInterval(loginOtpConfig.verifyWindowMinutes)]
  )

  return Number(rows[0]?.attempt_count || 0)
}

async function getLatestPhoneRequestAt(customerId: string) {
  const pool = getLoginOtpPool()
  const { rows } = await pool.query(
    `
      SELECT created_at
      FROM customer_login_otp_code
      WHERE customer_id = $1
        AND used_at IS NULL
        AND invalidated_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [customerId]
  )

  return rows[0]?.created_at ? new Date(rows[0].created_at as string) : null
}

function getRemainingCooldownSeconds(lastRequestedAt: Date | null) {
  if (!lastRequestedAt) return 0
  const elapsed = Math.floor((Date.now() - lastRequestedAt.getTime()) / 1000)
  const remaining = loginOtpConfig.phoneResendCooldownSeconds - elapsed
  return remaining > 0 ? remaining : 0
}

export async function requestPhoneLoginOtp(
  req: LoginOtpRequestContext,
  phoneInput: unknown
) {
  await maybeRunCleanup()

  const normalized = normalizeIndianPhone(phoneInput)
  if (!normalized) {
    return {
      ok: false as const,
      status: 400,
      message: "Enter a valid Indian mobile number.",
    }
  }

  if (!hasMsg91Config()) {
    return {
      ok: false as const,
      status: 503,
      message: "OTP service is temporarily unavailable.",
    }
  }

  const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>)
  const phoneHash = createLookupHash("phone", normalized.e164)
  const ipHash = ip ? createLookupHash("ip", ip) : null

  await recordAuditEvent({
    eventType: "phone_request",
    emailHash: phoneHash,
    ipHash,
  })

  const counts = await getPhoneRequestRateCounts(phoneHash, ipHash)
  if (
    counts.phoneCount > loginOtpConfig.phoneMaxRequestsPerPhone ||
    counts.ipCount > loginOtpConfig.phoneMaxRequestsPerIp
  ) {
    await recordAuditEvent({
      eventType: "phone_request_rate_limited",
      emailHash: phoneHash,
      ipHash,
    })
    return { ok: false as const, status: 429, message: "Please try again later." }
  }

  const customer = await findCustomerByPhone(req, normalized.e164)
  if (!customer?.id) {
    await recordAuditEvent({
      eventType: "phone_request_skipped_unregistered",
      emailHash: phoneHash,
      ipHash,
    })
    return {
      ok: false as const,
      status: 404,
      message: "Entered mobile number is not registered.",
    }
  }

  const authIdentity = await findAuthIdentityByEmail(customer.email || "")
  if (!authIdentity?.id) {
    return {
      ok: false as const,
      status: 400,
      message: "Account setup incomplete. Please use password reset once.",
    }
  }

  const lastRequestedAt = await getLatestPhoneRequestAt(customer.id)
  const cooldownRemaining = getRemainingCooldownSeconds(lastRequestedAt)
  if (cooldownRemaining > 0) {
    await recordAuditEvent({
      eventType: "phone_request_cooldown",
      emailHash: phoneHash,
      ipHash,
      customerId: customer.id,
      metadata: { cooldown_remaining_seconds: cooldownRemaining },
    })
    return {
      ok: false as const,
      status: 429,
      message: `Please wait ${cooldownRemaining}s before requesting another OTP.`,
    }
  }

  const pool = getLoginOtpPool()
  const client = await pool.connect()
  const otp = createOtp()
  const otpHash = hashOtp(otp)
  const expiresAt = new Date(Date.now() + loginOtpConfig.otpTtlMinutes * 60 * 1000)

  try {
    await client.query("BEGIN")
    await invalidateActiveOtpForCustomer(client, customer.id)
    await client.query(
      `
        INSERT INTO customer_login_otp_code (
          id,
          customer_id,
          auth_identity_id,
          otp_hash,
          email_hash,
          request_ip_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [randomUUID(), customer.id, authIdentity.id, otpHash, phoneHash, ipHash, expiresAt]
    )
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  try {
    await sendMsg91Otp(normalized.e164)
  } catch {
    await pool.query(
      `
        UPDATE customer_login_otp_code
        SET invalidated_at = NOW(), updated_at = NOW()
        WHERE otp_hash = $1
      `,
      [otpHash]
    )
    await recordAuditEvent({
      eventType: "phone_request_send_failed",
      emailHash: phoneHash,
      ipHash,
      customerId: customer.id,
    })
    return { ok: false as const, status: 503, message: "Unable to send OTP right now." }
  }

  return { ok: true as const, status: 200, message: "OTP sent successfully." }
}

export async function verifyPhoneLoginOtp(
  req: LoginOtpRequestContext,
  input: { phone: unknown; otp: unknown }
): Promise<VerifyResult> {
  const normalized = normalizeIndianPhone(input.phone)
  const otp = normalizePhoneOtp(input.otp)
  if (!normalized || !otp) {
    return { ok: false, status: 400, message: "Enter valid mobile number and 4-digit OTP." }
  }

  const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>)
  const ipHash = ip ? createLookupHash("ip", ip) : null
  const phoneHash = createLookupHash("phone", normalized.e164)
  const otpHash = hashOtp(otp)

  await recordAuditEvent({
    eventType: "phone_verify",
    emailHash: phoneHash,
    ipHash,
    otpHash,
  })

  const verifyAttemptCount = await getPhoneVerifyAttemptCount(ipHash, phoneHash)
  if (verifyAttemptCount > loginOtpConfig.maxVerifyAttemptsPerIp) {
    await recordAuditEvent({
      eventType: "phone_verify_rate_limited",
      emailHash: phoneHash,
      ipHash,
    })
    return { ok: false, status: 429, message: "Too many attempts. Please try later." }
  }

  const pool = getLoginOtpPool()
  const { rows } = await pool.query(
    `
      SELECT id, customer_id, auth_identity_id, otp_hash, attempt_count, expires_at, used_at, invalidated_at
      FROM customer_login_otp_code
      WHERE email_hash = $1
        AND used_at IS NULL
        AND invalidated_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [phoneHash]
  )

  const otpRecord = rows[0]
  if (!otpRecord?.id) {
    await recordAuditEvent({ eventType: "phone_verify_invalid", emailHash: phoneHash, ipHash })
    return { ok: false, status: 400, message: "Invalid or expired OTP." }
  }

  const expiresAt = new Date(otpRecord.expires_at)
  if (expiresAt.getTime() <= Date.now()) {
    await pool.query(
      `UPDATE customer_login_otp_code SET invalidated_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [otpRecord.id]
    )
    return { ok: false, status: 400, message: "Invalid or expired OTP." }
  }

  const msg91Verified = await verifyMsg91Otp(normalized.e164, otp).catch(() => false)
  if (!msg91Verified) {
    const nextAttemptCount = Number(otpRecord.attempt_count || 0) + 1
    const shouldInvalidate = nextAttemptCount >= loginOtpConfig.maxVerifyAttemptsPerCode
    await pool.query(
      `
        UPDATE customer_login_otp_code
        SET attempt_count = $2, last_attempt_at = NOW(),
            invalidated_at = CASE WHEN $3::boolean THEN NOW() ELSE invalidated_at END,
            updated_at = NOW()
        WHERE id = $1
      `,
      [otpRecord.id, nextAttemptCount, shouldInvalidate]
    )
    await recordAuditEvent({
      eventType: "phone_verify_invalid",
      emailHash: phoneHash,
      ipHash,
      metadata: { attempt_count: nextAttemptCount },
    })
    return { ok: false, status: 400, message: "Invalid or expired OTP." }
  }

  const authService = req.scope.resolve(Modules.AUTH) as {
    retrieveAuthIdentity: (id: string) => Promise<AuthIdentityRecord | null>
  }
  const authIdentity = await authService.retrieveAuthIdentity(String(otpRecord.auth_identity_id))
  if (!authIdentity?.id) {
    return { ok: false, status: 400, message: "Unable to verify account." }
  }

  const jwtConfig = getJwtConfig(req)
  const token = generateCustomerAuthToken({
    authIdentity,
    authProvider: "emailpass",
    secret: jwtConfig.secret,
    expiresIn: jwtConfig.expiresIn,
    options: jwtConfig.options,
  })

  await pool.query(
    `UPDATE customer_login_otp_code SET used_at = NOW(), invalidated_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [otpRecord.id]
  )
  await pool.query(
    `UPDATE customer SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"is_phone_verified": true}'::jsonb, updated_at = NOW() WHERE id = $1`,
    [otpRecord.customer_id]
  )

  await recordAuditEvent({
    eventType: "phone_verify_success",
    emailHash: phoneHash,
    ipHash,
    customerId: String(otpRecord.customer_id),
  })

  return { ok: true, status: 200, message: "OTP verified successfully.", token }
}

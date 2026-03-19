import { randomUUID } from "node:crypto"

import { Modules } from "@medusajs/framework/utils"
import type { PoolClient } from "pg"

import { getPasswordResetPool } from "./db"
import { hasPasswordResetMailerConfig, passwordResetConfig } from "./config"
import {
  buildResetUrl,
  createLookupHash,
  createPasswordResetToken,
  getClientIp,
  hashToken,
  normalizeEmail,
  normalizeToken,
  safeEqualHex,
} from "./crypto"
import { sendPasswordResetEmail } from "./mailer"
import {
  PASSWORD_POLICY_MESSAGE,
  validateStrongPassword,
} from "./password-policy"

const GENERIC_REQUEST_MESSAGE =
  "If an account exists, a reset link has been sent."
const GENERIC_TOKEN_MESSAGE =
  "This reset link is invalid or has expired."

type CustomerRecord = {
  id: string
  email?: string | null
  has_account?: boolean | null
  metadata?: Record<string, unknown> | null
}

type PasswordResetRequestContext = {
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
  | "validate"
  | "validate_invalid"
  | "validate_rate_limited"
  | "validate_expired"
  | "reset"
  | "reset_invalid"
  | "reset_rate_limited"
  | "reset_expired"
  | "reset_success"

type ValidationResult =
  | {
      valid: true
      tokenRecordId: string
      customerId: string
    }
  | {
      valid: false
      message: string
    }

function getAuditInterval(days: number) {
  return `${days} days`
}

function getWindowInterval(minutes: number) {
  return `${minutes} minutes`
}

function getTokenRetentionInterval(hours: number) {
  return `${hours} hours`
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

async function recordAuditEvent(input: {
  eventType: AuditEventType
  emailHash?: string | null
  ipHash?: string | null
  tokenHash?: string | null
  customerId?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const pool = getPasswordResetPool()
  await pool.query(
    `
      INSERT INTO customer_password_reset_audit (
        id,
        event_type,
        email_hash,
        ip_hash,
        token_hash,
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
      input.tokenHash ?? null,
      input.customerId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  )
}

async function maybeRunCleanup() {
  if (Math.random() > 0.05) {
    return
  }

  const pool = getPasswordResetPool()

  await pool.query(
    `
      DELETE FROM customer_password_reset_audit
      WHERE created_at < NOW() - $1::interval
    `,
    [getAuditInterval(passwordResetConfig.auditRetentionDays)]
  )

  await pool.query(
    `
      DELETE FROM customer_password_reset_token
      WHERE created_at < NOW() - $1::interval
        AND (
          used_at IS NOT NULL
          OR invalidated_at IS NOT NULL
          OR expires_at < NOW()
        )
    `,
    [getTokenRetentionInterval(passwordResetConfig.tokenRetentionHours)]
  )
}

async function getRequestRateCounts(emailHash: string, ipHash: string | null) {
  const pool = getPasswordResetPool()
  const { rows } = await pool.query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN email_hash = $1 THEN 1 ELSE 0 END), 0)::int AS email_count,
        COALESCE(SUM(CASE WHEN ip_hash = $2 THEN 1 ELSE 0 END), 0)::int AS ip_count
      FROM customer_password_reset_audit
      WHERE event_type = 'request'
        AND created_at >= NOW() - $3::interval
    `,
    [emailHash, ipHash, getWindowInterval(passwordResetConfig.requestWindowMinutes)]
  )

  return {
    emailCount: Number(rows[0]?.email_count || 0),
    ipCount: Number(rows[0]?.ip_count || 0),
  }
}

async function getResetAttemptCount(ipHash: string | null) {
  if (!ipHash) {
    return 0
  }

  const pool = getPasswordResetPool()
  const { rows } = await pool.query(
    `
      SELECT COUNT(*)::int AS attempt_count
      FROM customer_password_reset_audit
      WHERE event_type IN ('validate', 'reset')
        AND ip_hash = $1
        AND created_at >= NOW() - $2::interval
    `,
    [ipHash, getWindowInterval(passwordResetConfig.resetAttemptWindowMinutes)]
  )

  return Number(rows[0]?.attempt_count || 0)
}

async function findCustomerByEmail(
  req: PasswordResetRequestContext,
  email: string
) {
  const customerService = req.scope.resolve(Modules.CUSTOMER) as {
    listCustomers: (filters: Record<string, unknown>) => Promise<CustomerRecord[]>
  }

  const customers = await customerService.listCustomers({
    email,
    has_account: true,
  })

  return customers?.[0] ?? null
}

async function invalidateActiveTokensForCustomer(
  client: PoolClient,
  customerId: string
) {
  await client.query(
    `
      UPDATE customer_password_reset_token
      SET invalidated_at = NOW(), updated_at = NOW()
      WHERE customer_id = $1
        AND used_at IS NULL
        AND invalidated_at IS NULL
    `,
    [customerId]
  )
}

async function lookupActiveToken(token: string) {
  const normalizedToken = normalizeToken(token)
  if (!normalizedToken) {
    return null
  }

  const pool = getPasswordResetPool()
  const tokenHash = hashToken(normalizedToken)
  const { rows } = await pool.query(
    `
      SELECT
        id,
        customer_id,
        token_hash,
        expires_at,
        used_at,
        invalidated_at
      FROM customer_password_reset_token
      WHERE token_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  )

  const row = rows[0]
  if (!row) {
    return null
  }

  if (!safeEqualHex(String(row.token_hash), tokenHash)) {
    return null
  }

  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    tokenHash: String(row.token_hash),
    expiresAt: new Date(row.expires_at),
    usedAt: row.used_at ? new Date(row.used_at) : null,
    invalidatedAt: row.invalidated_at ? new Date(row.invalidated_at) : null,
  }
}

export function getGenericPasswordResetRequestMessage() {
  return GENERIC_REQUEST_MESSAGE
}

export function getGenericPasswordResetTokenMessage() {
  return GENERIC_TOKEN_MESSAGE
}

export function getPasswordPolicyMessage() {
  return PASSWORD_POLICY_MESSAGE
}

export async function requestPasswordReset(
  req: PasswordResetRequestContext,
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
    counts.emailCount > passwordResetConfig.maxRequestsPerEmail ||
    counts.ipCount > passwordResetConfig.maxRequestsPerIp
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
  if (!customer?.id || !customer.email || !customer.has_account) {
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

  if (
    passwordResetConfig.requireVerifiedEmail &&
    !isEmailVerified(customer)
  ) {
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

  if (!passwordResetConfig.frontendUrl || !hasPasswordResetMailerConfig()) {
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

  const pool = getPasswordResetPool()
  const client = await pool.connect()
  const { rawToken, tokenHash } = createPasswordResetToken()
  const resetUrl = buildResetUrl(rawToken)
  const expiresAt = new Date(
    Date.now() + passwordResetConfig.tokenTtlMinutes * 60 * 1000
  )

  if (!resetUrl) {
    client.release()
    return {
      ok: true as const,
      status: 200,
      message: GENERIC_REQUEST_MESSAGE,
    }
  }

  try {
    await client.query("BEGIN")
    await invalidateActiveTokensForCustomer(client, customer.id)
    await client.query(
      `
        INSERT INTO customer_password_reset_token (
          id,
          customer_id,
          token_hash,
          email_hash,
          request_ip_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        randomUUID(),
        customer.id,
        tokenHash,
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
    await sendPasswordResetEmail({
      to: customer.email,
      resetUrl,
      expiresInMinutes: passwordResetConfig.tokenTtlMinutes,
    })

    await recordAuditEvent({
      eventType: "request_email_sent",
      emailHash,
      ipHash,
      tokenHash,
      customerId: customer.id,
    })
  } catch {
    await pool.query(
      `
        UPDATE customer_password_reset_token
        SET invalidated_at = NOW(), updated_at = NOW()
        WHERE token_hash = $1
      `,
      [tokenHash]
    )

    await recordAuditEvent({
      eventType: "request_email_send_failed",
      emailHash,
      ipHash,
      tokenHash,
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

export async function validatePasswordResetToken(
  req: PasswordResetRequestContext,
  tokenInput: unknown
): Promise<ValidationResult> {
  const token = normalizeToken(tokenInput)
  if (!token) {
    return {
      valid: false,
      message: GENERIC_TOKEN_MESSAGE,
    }
  }

  const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>)
  const ipHash = ip ? createLookupHash("ip", ip) : null
  const tokenHash = hashToken(token)

  await recordAuditEvent({
    eventType: "validate",
    ipHash,
    tokenHash,
  })

  const attemptCount = await getResetAttemptCount(ipHash)
  if (attemptCount > passwordResetConfig.maxResetAttemptsPerIp) {
    await recordAuditEvent({
      eventType: "validate_rate_limited",
      ipHash,
      tokenHash,
    })

    return {
      valid: false,
      message: GENERIC_TOKEN_MESSAGE,
    }
  }

  const tokenRecord = await lookupActiveToken(token)
  if (!tokenRecord) {
    await recordAuditEvent({
      eventType: "validate_invalid",
      ipHash,
      tokenHash,
    })

    return {
      valid: false,
      message: GENERIC_TOKEN_MESSAGE,
    }
  }

  if (
    tokenRecord.usedAt ||
    tokenRecord.invalidatedAt ||
    tokenRecord.expiresAt.getTime() <= Date.now()
  ) {
    await recordAuditEvent({
      eventType: "validate_expired",
      ipHash,
      tokenHash,
      customerId: tokenRecord.customerId,
    })

    return {
      valid: false,
      message: GENERIC_TOKEN_MESSAGE,
    }
  }

  return {
    valid: true,
    tokenRecordId: tokenRecord.id,
    customerId: tokenRecord.customerId,
  }
}

export async function resetPasswordWithToken(
  req: PasswordResetRequestContext,
  input: { token: unknown; password: unknown }
) {
  const token = normalizeToken(input.token)
  if (!token) {
    return {
      ok: false as const,
      status: 400,
      message: GENERIC_TOKEN_MESSAGE,
    }
  }

  if (typeof input.password !== "string" || !input.password.trim()) {
    return {
      ok: false as const,
      status: 400,
      message: "Enter a new password.",
    }
  }

  const password = input.password.trim()
  const passwordError = validateStrongPassword(password)
  if (passwordError) {
    return {
      ok: false as const,
      status: 400,
      message: passwordError,
    }
  }

  const ip = getClientIp(req.headers as Record<string, string | string[] | undefined>)
  const ipHash = ip ? createLookupHash("ip", ip) : null
  const tokenHash = hashToken(token)

  await recordAuditEvent({
    eventType: "reset",
    ipHash,
    tokenHash,
  })

  const attemptCount = await getResetAttemptCount(ipHash)
  if (attemptCount > passwordResetConfig.maxResetAttemptsPerIp) {
    await recordAuditEvent({
      eventType: "reset_rate_limited",
      ipHash,
      tokenHash,
    })

    return {
      ok: false as const,
      status: 429,
      message: GENERIC_TOKEN_MESSAGE,
    }
  }

  const pool = getPasswordResetPool()
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    const { rows } = await client.query(
      `
        SELECT
          id,
          customer_id,
          token_hash,
          expires_at,
          used_at,
          invalidated_at
        FROM customer_password_reset_token
        WHERE token_hash = $1
        FOR UPDATE
      `,
      [tokenHash]
    )

    const tokenRecord = rows[0]
    if (!tokenRecord || !safeEqualHex(String(tokenRecord.token_hash), tokenHash)) {
      await client.query("ROLLBACK")
      await recordAuditEvent({
        eventType: "reset_invalid",
        ipHash,
        tokenHash,
      })

      return {
        ok: false as const,
        status: 400,
        message: GENERIC_TOKEN_MESSAGE,
      }
    }

    const expiresAt = new Date(tokenRecord.expires_at)
    if (
      tokenRecord.used_at ||
      tokenRecord.invalidated_at ||
      expiresAt.getTime() <= Date.now()
    ) {
      await client.query(
        `
          UPDATE customer_password_reset_token
          SET invalidated_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `,
        [tokenRecord.id]
      )
      await client.query("COMMIT")

      await recordAuditEvent({
        eventType: "reset_expired",
        ipHash,
        tokenHash,
        customerId: String(tokenRecord.customer_id),
      })

      return {
        ok: false as const,
        status: 400,
        message: GENERIC_TOKEN_MESSAGE,
      }
    }

    const customerService = req.scope.resolve(Modules.CUSTOMER) as {
      retrieveCustomer: (id: string) => Promise<CustomerRecord>
      updateCustomers: (id: string, data: Record<string, unknown>) => Promise<unknown>
    }
    const authService = req.scope.resolve(Modules.AUTH) as {
      updateProvider: (
        provider: string,
        data: Record<string, unknown>
      ) => Promise<{ success?: boolean; error?: string }>
    }

    const customer = await customerService.retrieveCustomer(
      String(tokenRecord.customer_id)
    )

    if (!customer?.email) {
      await client.query("ROLLBACK")
      return {
        ok: false as const,
        status: 400,
        message: GENERIC_TOKEN_MESSAGE,
      }
    }

    const updateResult = await authService.updateProvider("emailpass", {
      entity_id: customer.email,
      password,
    })

    if (!updateResult?.success) {
      await client.query("ROLLBACK")
      return {
        ok: false as const,
        status: 500,
        message: "Something went wrong. Please try again.",
      }
    }

    await client.query(
      `
        UPDATE customer_password_reset_token
        SET used_at = NOW(), invalidated_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `,
      [tokenRecord.id]
    )

    await client.query(
      `
        UPDATE customer_password_reset_token
        SET invalidated_at = NOW(), updated_at = NOW()
        WHERE customer_id = $1
          AND id <> $2
          AND used_at IS NULL
          AND invalidated_at IS NULL
      `,
      [tokenRecord.customer_id, tokenRecord.id]
    )

    await client.query("COMMIT")

    if (!customer.has_account) {
      await customerService.updateCustomers(customer.id, {
        has_account: true,
      })
    }

    await recordAuditEvent({
      eventType: "reset_success",
      ipHash,
      tokenHash,
      customerId: customer.id,
    })

    return {
      ok: true as const,
      status: 200,
      message: "Password reset successfully. Please log in.",
    }
  } catch {
    await client.query("ROLLBACK")
    return {
      ok: false as const,
      status: 500,
      message: "Something went wrong. Please try again.",
    }
  } finally {
    client.release()
  }
}

const DEFAULT_OTP_TTL_MINUTES = 10
const DEFAULT_REQUEST_WINDOW_MINUTES = 60
const DEFAULT_MAX_REQUESTS_PER_IP = 5
const DEFAULT_MAX_REQUESTS_PER_EMAIL = 5
const DEFAULT_VERIFY_WINDOW_MINUTES = 15
const DEFAULT_MAX_VERIFY_ATTEMPTS_PER_IP = 10
const DEFAULT_MAX_VERIFY_ATTEMPTS_PER_CODE = 5
const DEFAULT_AUDIT_RETENTION_DAYS = 30
const DEFAULT_OTP_RETENTION_HOURS = 48

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  options?: { min?: number; max?: number }
) {
  const parsed = Number.parseInt(value ?? "", 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  if (options?.min && parsed < options.min) {
    return fallback
  }

  if (options?.max && parsed > options.max) {
    return fallback
  }

  return parsed
}

function parseBoolean(value: string | undefined, fallback = false) {
  if (typeof value !== "string") {
    return fallback
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true
    case "0":
    case "false":
    case "no":
    case "off":
      return false
    default:
      return fallback
  }
}

export const loginOtpConfig = {
  otpTtlMinutes: parsePositiveInt(
    process.env.LOGIN_OTP_TTL_MINUTES,
    DEFAULT_OTP_TTL_MINUTES,
    { min: 3, max: 30 }
  ),
  requestWindowMinutes: parsePositiveInt(
    process.env.LOGIN_OTP_WINDOW_MINUTES,
    DEFAULT_REQUEST_WINDOW_MINUTES,
    { min: 5, max: 1440 }
  ),
  maxRequestsPerIp: parsePositiveInt(
    process.env.LOGIN_OTP_MAX_REQUESTS_PER_IP,
    DEFAULT_MAX_REQUESTS_PER_IP,
    { min: 1, max: 20 }
  ),
  maxRequestsPerEmail: parsePositiveInt(
    process.env.LOGIN_OTP_MAX_REQUESTS_PER_EMAIL,
    DEFAULT_MAX_REQUESTS_PER_EMAIL,
    { min: 1, max: 20 }
  ),
  verifyWindowMinutes: parsePositiveInt(
    process.env.LOGIN_OTP_ATTEMPT_WINDOW_MINUTES,
    DEFAULT_VERIFY_WINDOW_MINUTES,
    { min: 1, max: 1440 }
  ),
  maxVerifyAttemptsPerIp: parsePositiveInt(
    process.env.LOGIN_OTP_MAX_VERIFY_ATTEMPTS_PER_IP,
    DEFAULT_MAX_VERIFY_ATTEMPTS_PER_IP,
    { min: 1, max: 100 }
  ),
  maxVerifyAttemptsPerCode: parsePositiveInt(
    process.env.LOGIN_OTP_MAX_VERIFY_ATTEMPTS_PER_CODE,
    DEFAULT_MAX_VERIFY_ATTEMPTS_PER_CODE,
    { min: 1, max: 20 }
  ),
  auditRetentionDays: parsePositiveInt(
    process.env.LOGIN_OTP_AUDIT_RETENTION_DAYS,
    DEFAULT_AUDIT_RETENTION_DAYS,
    { min: 1, max: 365 }
  ),
  otpRetentionHours: parsePositiveInt(
    process.env.LOGIN_OTP_RETENTION_HOURS,
    DEFAULT_OTP_RETENTION_HOURS,
    { min: 1, max: 720 }
  ),
  requireVerifiedEmail: parseBoolean(
    process.env.LOGIN_OTP_REQUIRE_VERIFIED_EMAIL,
    false
  ),
  smtp: {
    host: process.env.SMTP_HOST?.trim() || "",
    port: parsePositiveInt(process.env.SMTP_PORT, 465, { min: 1, max: 65535 }),
    secure: parseBoolean(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER?.trim() || "",
    password: process.env.SMTP_PASSWORD?.trim() || "",
    fromEmail: process.env.SMTP_FROM_EMAIL?.trim() || "",
    fromName: process.env.SMTP_FROM_NAME?.trim() || "OWEG",
  },
}

export function hasLoginOtpMailerConfig() {
  const { smtp } = loginOtpConfig

  return Boolean(
    smtp.host && smtp.port && smtp.user && smtp.password && smtp.fromEmail
  )
}

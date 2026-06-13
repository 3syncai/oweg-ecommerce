function normalizeUrl(value: string | undefined) {
  if (!value) {
    return null
  }

  return value.trim().replace(/\/+$/, "")
}

export const adminPasswordResetConfig = {
  adminUrl: normalizeUrl(
    process.env.ADMIN_URL || process.env.MEDUSA_URL || "http://localhost:9000"
  ),
  tokenTtlMinutes: 15,
}

export function buildAdminResetUrl(token: string) {
  if (!adminPasswordResetConfig.adminUrl) {
    return null
  }

  return `${adminPasswordResetConfig.adminUrl}/app/reset-password?token=${encodeURIComponent(
    token
  )}`
}

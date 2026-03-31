import { Pool } from "pg"

const DATABASE_URL = process.env.DATABASE_URL?.trim() || ""

let sharedPool: Pool | null = null

export const PASSWORD_RESET_REQUIRED_MESSAGE =
  "Due to a security update, you'll need to reset your password once. After that, login will work as usual."

export function passwordResetRequiredPayload() {
  return {
    error: PASSWORD_RESET_REQUIRED_MESSAGE,
    code: "PASSWORD_RESET_REQUIRED",
    requires_password_reset: true,
  }
}

function getPool() {
  if (!DATABASE_URL) {
    return null
  }

  if (!sharedPool) {
    sharedPool = new Pool({ connectionString: DATABASE_URL })
  }

  return sharedPool
}

export async function isPasswordResetRequired(email: string) {
  const pool = getPool()
  if (!pool) {
    return false
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT 1
        FROM customer c
        JOIN provider_identity pi
          ON lower(pi.entity_id) = lower(c.email)
         AND pi.provider = 'emailpass'
         AND pi.deleted_at IS NULL
        JOIN auth_identity ai
          ON ai.id = pi.auth_identity_id
         AND ai.deleted_at IS NULL
        WHERE c.deleted_at IS NULL
          AND COALESCE(c.has_account, false) = true
          AND lower(c.email) = lower($1)
          AND COALESCE(ai.app_metadata->>'customer_id', '') = c.id
          AND (pi.provider_metadata->>'password') IS NULL
        LIMIT 1
      `,
      [email]
    )

    return rows.length > 0
  } catch {
    return false
  }
}

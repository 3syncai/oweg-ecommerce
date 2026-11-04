/**
 * OpenCart MySQL config — env vars only. No password/host fallbacks in source.
 */
export function requireOpenCartDbConfig() {
  const host = process.env.OPENCART_DB_HOST?.trim()
  const user = process.env.OPENCART_DB_USER?.trim()
  const password = process.env.OPENCART_DB_PASSWORD
  const database = process.env.OPENCART_DB_NAME?.trim()
  const port = parseInt(process.env.OPENCART_DB_PORT || "3306", 10)

  if (!host || !user || password == null || password === "" || !database) {
    throw new Error(
      "Missing OpenCart DB env: OPENCART_DB_HOST, OPENCART_DB_USER, OPENCART_DB_PASSWORD, OPENCART_DB_NAME"
    )
  }

  return { host, port, user, password, database }
}

export function requireMedusaDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error("DATABASE_URL is required (no hardcoded Medusa connection string)")
  }
  return url
}

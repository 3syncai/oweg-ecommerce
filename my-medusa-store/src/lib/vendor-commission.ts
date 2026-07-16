import type { Pool } from "pg"

export const DEFAULT_VENDOR_COMMISSION_RATE = 2
export const VENDOR_COMMISSION_METADATA_KEY = "vendor_commission_default_rate"

export function clampCommissionRate(rate: unknown): number {
  const n = typeof rate === "string" ? Number(rate) : Number(rate)
  if (!Number.isFinite(n)) return DEFAULT_VENDOR_COMMISSION_RATE
  return Math.min(100, Math.max(0, n))
}

export function resolveVendorCommissionRate(
  vendor: { commission_override?: boolean | null; commission_rate?: number | null },
  globalDefault: number
): { rate: number; source: "custom" | "global" } {
  if (vendor.commission_override === true) {
    return { rate: clampCommissionRate(vendor.commission_rate), source: "custom" }
  }
  return { rate: clampCommissionRate(globalDefault), source: "global" }
}

export async function getVendorCommissionDefaultRate(pool: Pool): Promise<number> {
  const result = await pool.query<{ metadata: Record<string, unknown> | null }>(
    `SELECT metadata FROM store ORDER BY created_at ASC NULLS LAST LIMIT 1`
  )
  const meta = result.rows[0]?.metadata || {}
  const raw = meta[VENDOR_COMMISSION_METADATA_KEY]
  return clampCommissionRate(raw ?? DEFAULT_VENDOR_COMMISSION_RATE)
}

export async function setVendorCommissionDefaultRate(
  pool: Pool,
  rate: number
): Promise<number> {
  const next = clampCommissionRate(rate)
  const existing = await pool.query<{ id: string; metadata: Record<string, unknown> | null }>(
    `SELECT id, metadata FROM store ORDER BY created_at ASC NULLS LAST LIMIT 1`
  )
  const row = existing.rows[0]
  if (!row) throw new Error("Store not found")
  const metadata = { ...(row.metadata || {}), [VENDOR_COMMISSION_METADATA_KEY]: next }
  await pool.query(
    `UPDATE store SET metadata = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(metadata), row.id]
  )
  return next
}

import { Modules } from "@medusajs/framework/utils"
import { Client } from "pg"

type MedusaExecArgs = {
  container: {
    resolve: (key: string) => unknown
  }
}

type CustomerAddressRow = {
  id: string
  customer_id: string
  address_name?: string | null
  company?: string | null
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  postal_code?: string | null
  country_code?: string | null
  is_default_shipping?: boolean | null
  is_default_billing?: boolean | null
  updated_at?: Date | string | null
  created_at?: Date | string | null
}

function normalizePart(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ")
}

function matchKey(addr: CustomerAddressRow): string {
  return [
    normalizePart(addr.address_1),
    normalizePart(addr.address_2),
    normalizePart(addr.city),
    normalizePart(addr.postal_code),
    normalizePart(addr.country_code) || "in",
  ].join("|")
}

function deriveAddressName(addr: CustomerAddressRow): string {
  const named = typeof addr.address_name === "string" ? addr.address_name.trim() : ""
  if (named) return named
  if (addr.is_default_shipping) return "Home"
  const company = typeof addr.company === "string" ? addr.company.trim() : ""
  if (company) return company
  const fullName = [addr.first_name, addr.last_name]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ")
  if (fullName) return fullName
  const line1 = typeof addr.address_1 === "string" ? addr.address_1.trim() : ""
  if (line1) return line1.length > 48 ? `${line1.slice(0, 45)}…` : line1
  const city = typeof addr.city === "string" ? addr.city.trim() : ""
  if (city) return city
  return "Address"
}

function toTime(value?: Date | string | null): number {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : 0
}

function pickSurvivor(group: CustomerAddressRow[]): CustomerAddressRow {
  const ranked = [...group].sort((a, b) => {
    const ship = Number(Boolean(b.is_default_shipping)) - Number(Boolean(a.is_default_shipping))
    if (ship) return ship
    const bill = Number(Boolean(b.is_default_billing)) - Number(Boolean(a.is_default_billing))
    if (bill) return bill
    return toTime(b.updated_at) - toTime(a.updated_at) || toTime(b.created_at) - toTime(a.created_at)
  })
  return ranked[0]
}

/**
 * Soft-delete duplicate customer_address rows and backfill blank address_name.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/dedupe-customer-addresses.ts
 */
export default async function dedupeCustomerAddresses({ container }: MedusaExecArgs) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const customerModule = container.resolve(Modules.CUSTOMER) as {
    listCustomerAddresses: (
      filters?: Record<string, unknown>,
      config?: { take?: number; skip?: number; order?: Record<string, string> }
    ) => Promise<CustomerAddressRow[]>
    updateCustomerAddresses: (
      id: string,
      data: { address_name?: string }
    ) => Promise<CustomerAddressRow>
  }

  const pageSize = 200
  let skip = 0
  const all: CustomerAddressRow[] = []

  for (;;) {
    const batch = await customerModule.listCustomerAddresses(
      {},
      { take: pageSize, skip, order: { created_at: "ASC" } }
    )
    if (!batch.length) break
    all.push(...batch)
    if (batch.length < pageSize) break
    skip += pageSize
  }

  console.log(`[dedupe-customer-addresses] Loaded ${all.length} active address row(s)`)

  const byCustomer = new Map<string, CustomerAddressRow[]>()
  for (const addr of all) {
    if (!addr.customer_id || !addr.id) continue
    const list = byCustomer.get(addr.customer_id) || []
    list.push(addr)
    byCustomer.set(addr.customer_id, list)
  }

  const removeIds: string[] = []
  let groupsCollapsed = 0

  for (const [, addresses] of byCustomer) {
    const groups = new Map<string, CustomerAddressRow[]>()
    for (const addr of addresses) {
      const key = matchKey(addr)
      const [line1, , , pin] = key.split("|")
      // Skip blank keys — don't collapse unrelated empty addresses together
      if (!line1 && !pin) continue
      const group = groups.get(key) || []
      group.push(addr)
      groups.set(key, group)
    }

    for (const [, group] of groups) {
      if (group.length < 2) continue
      groupsCollapsed += 1
      const survivor = pickSurvivor(group)
      for (const addr of group) {
        if (addr.id !== survivor.id) removeIds.push(addr.id)
      }
      console.log(
        `[dedupe-customer-addresses] customer=${survivor.customer_id} kept=${survivor.id} remove=${group.length - 1}`
      )
    }
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  let deleted = 0
  try {
    if (removeIds.length) {
      await client.query("BEGIN")
      // Soft-delete so unique default indexes and admin list ignore these rows
      const result = await client.query(
        `
          UPDATE customer_address
          SET deleted_at = NOW(), updated_at = NOW()
          WHERE id = ANY($1::text[])
            AND deleted_at IS NULL
        `,
        [removeIds]
      )
      deleted = result.rowCount || 0
      await client.query("COMMIT")
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    await client.end().catch(() => undefined)
    throw error
  }

  await client.end()

  // Backfill address_name on remaining active rows
  skip = 0
  const remaining: CustomerAddressRow[] = []
  for (;;) {
    const batch = await customerModule.listCustomerAddresses(
      {},
      { take: pageSize, skip, order: { created_at: "ASC" } }
    )
    if (!batch.length) break
    remaining.push(...batch)
    if (batch.length < pageSize) break
    skip += pageSize
  }

  let renamed = 0
  for (const addr of remaining) {
    const current = typeof addr.address_name === "string" ? addr.address_name.trim() : ""
    if (current) continue
    const next = deriveAddressName(addr)
    await customerModule.updateCustomerAddresses(addr.id, { address_name: next })
    renamed += 1
  }

  console.log(
    `[dedupe-customer-addresses] Done. groupsCollapsed=${groupsCollapsed} deleted=${deleted} renamed=${renamed} remaining=${remaining.length}`
  )
}

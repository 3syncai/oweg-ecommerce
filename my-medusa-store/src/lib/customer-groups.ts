import { Modules } from "@medusajs/framework/utils"
import { Client } from "pg"

export const OWEG_CUSTOMER_GROUP_KEYS = [
  "partner_individual",
  "partner_business",
  "direct_individual",
  "direct_business",
] as const

export type OwegCustomerGroupKey = (typeof OWEG_CUSTOMER_GROUP_KEYS)[number]

export const OWEG_CUSTOMER_GROUPS: ReadonlyArray<{
  key: OwegCustomerGroupKey
  name: string
  source: "Partner" | "Direct"
  accountType: "Individual" | "Business"
}> = [
  {
    key: "partner_individual",
    name: "Partner - Individual",
    source: "Partner",
    accountType: "Individual",
  },
  {
    key: "partner_business",
    name: "Partner - Business",
    source: "Partner",
    accountType: "Business",
  },
  {
    key: "direct_individual",
    name: "Direct - Individual",
    source: "Direct",
    accountType: "Individual",
  },
  {
    key: "direct_business",
    name: "Direct - Business",
    source: "Direct",
    accountType: "Business",
  },
]

export type CustomerModuleLike = {
  listCustomerGroups: (
    filters?: Record<string, unknown>,
    config?: { take?: number; skip?: number }
  ) => Promise<Array<{ id: string; name: string; metadata?: Record<string, unknown> | null }>>
  createCustomerGroups: (data: {
    name: string
    metadata?: Record<string, unknown>
  }) => Promise<{ id: string; name: string; metadata?: Record<string, unknown> | null }>
  addCustomerToGroup: (pair: {
    customer_id: string
    customer_group_id: string
  }) => Promise<{ id: string }>
  removeCustomerFromGroup: (pair: {
    customer_id: string
    customer_group_id: string
  }) => Promise<void>
  listCustomerGroupCustomers?: (
    filters?: Record<string, unknown>,
    config?: { take?: number; skip?: number }
  ) => Promise<Array<{ id: string; customer_id: string; customer_group_id: string }>>
  listCustomers?: (
    filters?: Record<string, unknown>,
    config?: {
      take?: number
      skip?: number
      relations?: string[]
    }
  ) => Promise<
    Array<{
      id: string
      customer_type?: string | null
      referral_code?: string | null
      metadata?: Record<string, unknown> | null
      groups?: Array<{ id: string; name?: string; metadata?: Record<string, unknown> | null }>
    }>
  >
  createCustomers?: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<{ id: string } | Array<{ id: string }>>
  updateCustomers?: (
    id: string,
    data: Record<string, unknown>
  ) => Promise<unknown>
}

/** Matches storefront signup GSTIN validation (15 alphanumeric chars). */
export const GSTIN_REGEX = /^[0-9A-Z]{15}$/i

export function normalizeAccountType(
  value?: string | null
): "individual" | "business" {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
  return normalized === "business" ? "business" : "individual"
}

export function isValidGstin(value?: string | null): boolean {
  const trimmed = String(value || "").trim().toUpperCase()
  return GSTIN_REGEX.test(trimmed)
}

/**
 * Resolve Individual vs Business for OWEG grouping.
 * Business requires a real 15-char GSTIN (never bank/cheque junk, never
 * OpenCart "Business" label alone without GST).
 */
export function inferOwegAccountType(input: {
  customer_type?: string | null
  metadata?: Record<string, unknown> | null
  gst_number?: string | null
  customer_gst_number?: string | null
}): "individual" | "business" {
  const meta = input.metadata || {}
  const candidates = [
    input.gst_number,
    typeof meta.gst_number === "string" ? meta.gst_number : null,
    input.customer_gst_number,
  ]
  return candidates.some((value) => isValidGstin(value))
    ? "business"
    : "individual"
}

/** Return a displayable GSTIN or null (filters bank/cheque junk). */
export function displayableGstin(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = String(value || "").trim().toUpperCase()
    if (isValidGstin(trimmed)) return trimmed
  }
  return null
}

export function resolveOwegGroupKey(input: {
  accountType?: string | null
  hasPartnerReferral: boolean
}): OwegCustomerGroupKey {
  const accountType = normalizeAccountType(input.accountType)
  if (input.hasPartnerReferral) {
    return accountType === "business" ? "partner_business" : "partner_individual"
  }
  return accountType === "business" ? "direct_business" : "direct_individual"
}

export function groupMetaByDefinition(def: (typeof OWEG_CUSTOMER_GROUPS)[number]) {
  return {
    key: def.key,
    source: def.source,
    account_type: def.accountType.toLowerCase(),
  }
}

function metadataKey(
  metadata?: Record<string, unknown> | null
): string | null {
  if (!metadata || typeof metadata !== "object") return null
  const key = metadata.key
  return typeof key === "string" && key.trim() ? key.trim() : null
}

export async function ensureOwegCustomerGroups(
  customerModule: CustomerModuleLike
): Promise<Record<OwegCustomerGroupKey, { id: string; name: string }>> {
  const existing = await customerModule.listCustomerGroups(
    {},
    { take: 200, skip: 0 }
  )

  const byKey = new Map<string, { id: string; name: string }>()
  const byName = new Map<string, { id: string; name: string; metadata?: Record<string, unknown> | null }>()

  for (const group of existing) {
    byName.set(group.name, group)
    const key = metadataKey(group.metadata)
    if (key) {
      byKey.set(key, { id: group.id, name: group.name })
    }
  }

  const result = {} as Record<OwegCustomerGroupKey, { id: string; name: string }>

  for (const def of OWEG_CUSTOMER_GROUPS) {
    const fromKey = byKey.get(def.key)
    if (fromKey) {
      result[def.key] = fromKey
      continue
    }

    const fromName = byName.get(def.name)
    if (fromName) {
      result[def.key] = { id: fromName.id, name: fromName.name }
      continue
    }

    const created = await customerModule.createCustomerGroups({
      name: def.name,
      metadata: groupMetaByDefinition(def),
    })
    result[def.key] = { id: created.id, name: created.name }
  }

  return result
}

export async function isValidPartnerReferralCode(
  referralCode?: string | null
): Promise<boolean> {
  const normalized = String(referralCode || "")
    .trim()
    .toUpperCase()
  if (!normalized) return false
  if (!process.env.DATABASE_URL) {
    return false
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    // Cast ids to text — affiliate_user.id is uuid; other tables use text.
    const result = await client.query(
      `SELECT id::text AS id FROM affiliate_user WHERE UPPER(refer_code) = $1 AND is_approved = TRUE
       UNION
       SELECT id::text AS id FROM branch_admin WHERE UPPER(refer_code) = $1
       UNION
       SELECT id::text AS id FROM area_sales_manager WHERE UPPER(refer_code) = $1
       UNION
       SELECT id::text AS id FROM state_admin WHERE UPPER(refer_code) = $1
       LIMIT 1`,
      [normalized]
    )
    return result.rows.length > 0
  } catch (err) {
    console.warn("[customer-groups] referral validation failed:", err)
    return false
  } finally {
    await client.end().catch(() => undefined)
  }
}

export async function getPartnerReferralForCustomer(
  customerId: string,
  fallbacks?: {
    referral_code?: string | null
    metadata?: Record<string, unknown> | null
  }
): Promise<string | null> {
  const fromColumn =
    typeof fallbacks?.referral_code === "string"
      ? fallbacks.referral_code.trim()
      : ""
  const fromMeta =
    typeof fallbacks?.metadata?.referral_code === "string"
      ? String(fallbacks.metadata.referral_code).trim()
      : ""

  if (process.env.DATABASE_URL) {
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    try {
      await client.connect()
      const result = await client.query(
        `SELECT referral_code FROM customer_referral WHERE customer_id = $1 LIMIT 1`,
        [customerId]
      )
      const fromTable = String(result.rows[0]?.referral_code || "").trim()
      if (fromTable) return fromTable.toUpperCase()
    } catch (err) {
      console.warn("[customer-groups] customer_referral lookup failed:", err)
    } finally {
      await client.end().catch(() => undefined)
    }
  }

  if (fromColumn) return fromColumn.toUpperCase()
  if (fromMeta) return fromMeta.toUpperCase()
  return null
}

export async function assignCustomerToOwegGroup(
  customerModule: CustomerModuleLike,
  input: {
    customerId: string
    accountType?: string | null
    hasPartnerReferral: boolean
  }
): Promise<{ groupKey: OwegCustomerGroupKey; groupId: string; groupName: string }> {
  const groups = await ensureOwegCustomerGroups(customerModule)
  const groupKey = resolveOwegGroupKey({
    accountType: input.accountType,
    hasPartnerReferral: input.hasPartnerReferral,
  })
  const target = groups[groupKey]

  let currentGroupIds: string[] = []
  if (customerModule.listCustomerGroupCustomers) {
    const memberships = await customerModule.listCustomerGroupCustomers(
      { customer_id: input.customerId },
      { take: 50 }
    )
    currentGroupIds = memberships.map((m) => m.customer_group_id)
  } else if (customerModule.listCustomers) {
    const customers = await customerModule.listCustomers(
      { id: input.customerId },
      { take: 1, relations: ["groups"] }
    )
    currentGroupIds = (customers[0]?.groups || []).map((g) => g.id)
  }

  const owegGroupIds = new Set(
    OWEG_CUSTOMER_GROUP_KEYS.map((key) => groups[key].id)
  )

  for (const groupId of currentGroupIds) {
    if (!owegGroupIds.has(groupId)) continue
    if (groupId === target.id) continue
    await customerModule.removeCustomerFromGroup({
      customer_id: input.customerId,
      customer_group_id: groupId,
    })
  }

  if (!currentGroupIds.includes(target.id)) {
    await customerModule.addCustomerToGroup({
      customer_id: input.customerId,
      customer_group_id: target.id,
    })
  }

  return { groupKey, groupId: target.id, groupName: target.name }
}

export function resolveCustomerModule(container: {
  resolve: (key: string) => unknown
}): CustomerModuleLike {
  return container.resolve(Modules.CUSTOMER) as CustomerModuleLike
}

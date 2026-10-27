import type { Knex } from "knex"

type Customer = { id: string; email: string; deleted_at: string | Date | null }
type Identity = { id: string; created_at: string | Date; app_metadata?: Record<string, unknown> | null }
type Provider = { provider: string; entity_id: string; created_at: string | Date }

/** Never release credentials for an active account, another actor, or a later signup. */
export function canReleaseDeletedCustomerAuth(
  customer: Customer,
  identity: Identity,
  providers: Provider[],
  activeCustomerExists: boolean,
) {
  if (!customer.deleted_at || activeCustomerExists || !providers.length) return false
  const deletedAt = new Date(customer.deleted_at).getTime()
  const createdAt = new Date(identity.created_at).getTime()
  if (!Number.isFinite(deletedAt) || !Number.isFinite(createdAt) || createdAt > deletedAt) return false
  for (const [key, value] of Object.entries(identity.app_metadata || {})) {
    if (value == null) continue
    if (key !== "customer_id" || value !== customer.id) return false
  }
  const email = customer.email.trim().toLowerCase()
  return Boolean(email) && providers.every(provider => {
    const providerCreatedAt = new Date(provider.created_at).getTime()
    return provider.provider === "emailpass" && provider.entity_id.trim().toLowerCase() === email &&
      Number.isFinite(providerCreatedAt) && providerCreatedAt <= deletedAt
  })
}

/** Called only after customer deletion, under the protected admin delete route. */
export async function releaseDeletedCustomerAuth(db: Knex, customerId: string) {
  return db.transaction(async trx => {
    const customer = await trx("customer").where({ id: customerId })
      .first("id", "email", "deleted_at").forUpdate() as Customer | undefined
    if (!customer?.deleted_at || !customer.email) return [] as string[]
    const email = customer.email.trim().toLowerCase()
    const activeCustomer = await trx("customer").whereRaw("lower(email) = ?", [email])
      .whereNull("deleted_at").first("id")
    if (activeCustomer) return [] as string[]

    const candidates = await trx("auth_identity as a")
      .whereIn("a.id", trx("provider_identity").select("auth_identity_id")
        .where({ provider: "emailpass" }).whereRaw("lower(entity_id) = ?", [email]))
      .select("a.id", "a.created_at", "a.app_metadata").forUpdate() as Identity[]
    const released: string[] = []
    for (const identity of candidates) {
      const providers = await trx("provider_identity").where({ auth_identity_id: identity.id })
        .select("provider", "entity_id", "created_at").forUpdate() as Provider[]
      if (!canReleaseDeletedCustomerAuth(customer, identity, providers, false)) continue
      // Provider records have a uniqueness constraint even when soft-deleted.
      // Delete both records in this transaction; retain historical customer/order rows.
      await trx("provider_identity").where({ auth_identity_id: identity.id }).delete()
      await trx("auth_identity").where({ id: identity.id }).delete()
      released.push(identity.id)
    }
    return released
  })
}

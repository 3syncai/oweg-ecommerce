import {
  ensureOwegCustomerGroups,
  OWEG_CUSTOMER_GROUPS,
  resolveCustomerModule,
} from "../lib/customer-groups"

type MedusaExecArgs = {
  container: {
    resolve: (key: string) => unknown
  }
}

/**
 * Idempotent seed for Partner/Direct × Individual/Business customer groups.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/seed-customer-groups.ts
 */
export default async function seedCustomerGroups({ container }: MedusaExecArgs) {
  const customerModule = resolveCustomerModule(container)
  const groups = await ensureOwegCustomerGroups(customerModule)

  console.log("[seed-customer-groups] Ensured OWEG customer groups:")
  for (const def of OWEG_CUSTOMER_GROUPS) {
    const row = groups[def.key]
    console.log(`  - ${def.name} (${def.key}) -> ${row.id}`)
  }
}

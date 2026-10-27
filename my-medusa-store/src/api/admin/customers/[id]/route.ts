import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { removeCustomerAccountWorkflow } from "@medusajs/core-flows"
import type { Knex } from "knex"
import { releaseDeletedCustomerAuth } from "../../../../lib/deleted-customer-auth"

// Preserve the native read/edit handlers and existing admin authentication/RBAC.
export { GET, POST } from "@medusajs/medusa/api/admin/customers/[id]/route"

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!req.auth_context?.actor_id) return res.status(401).json({ message: "Admin sign-in required" })
  if (!["user", "api-key"].includes(req.auth_context.actor_type)) {
    return res.status(403).json({ message: "Admin access required" })
  }
  const id = req.params.id
  const db = req.scope.resolve<Knex>("__pg_connection__")
  const customer = await db("customer").where({ id }).first("id", "deleted_at")
  if (!customer) return res.status(404).json({ message: "Customer not found" })
  if (!customer.deleted_at) {
    await removeCustomerAccountWorkflow(req.scope).run({ input: { customerId: id } })
  }
  // Idempotent: a retry can finish credential cleanup after customer deletion.
  // No public signup endpoint is allowed to reset or delete an existing identity.
  await releaseDeletedCustomerAuth(db, id)
  return res.status(200).json({ id, object: "customer", deleted: true })
}

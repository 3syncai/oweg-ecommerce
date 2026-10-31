import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteCustomersWorkflow, removeCustomerAccountWorkflow } from "@medusajs/core-flows"
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
  const customer = await db("customer").where({ id }).first("id", "deleted_at", "has_account")
  if (!customer) return res.status(404).json({ message: "Customer not found" })
  if (!customer.deleted_at) {
    // Imported customers can be marked registered without a customer login identity.
    // Match the actor link, never an email that may belong to an admin or vendor.
    const customerIdentity = customer.has_account
      ? await db("auth_identity")
          .whereRaw("app_metadata->>'customer_id' = ?", [id])
          .whereNull("deleted_at")
          .first("id")
      : null
    if (customer.has_account && !customerIdentity) {
      // Keep native customer deletion hooks/events; do not create, reset, or
      // detach an unrelated login identity to satisfy the account workflow.
      await deleteCustomersWorkflow(req.scope).run({ input: { ids: [id] } })
    } else {
      await removeCustomerAccountWorkflow(req.scope).run({ input: { customerId: id } })
    }
  }
  // Idempotent: a retry can finish credential cleanup after customer deletion.
  // No public signup endpoint is allowed to reset or delete an existing identity.
  await releaseDeletedCustomerAuth(db, id)
  return res.status(200).json({ id, object: "customer", deleted: true })
}

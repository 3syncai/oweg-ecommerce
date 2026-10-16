import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows"
import { CUSTOMER_ORDER_SUMMARY_FIELDS, customerOrderSummary, summaryPagination } from "../../../../../lib/admin-access/customer-order-summary"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  let pagination: ReturnType<typeof summaryPagination>
  try { pagination = summaryPagination(req.query) }
  catch { return res.status(400).json({ message: "Use only a valid offset and limit (1–50)" }) }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({ entity: "customer", fields: ["id"], filters: { id: req.params.id } })
  if (!customers.length) return res.status(404).json({ message: "Customer not found" })
  // Never accept customer IDs, field expansions or order filters from the query.
  const { result } = await getOrdersListWorkflow(req.scope).run({ input: {
    fields: [...CUSTOMER_ORDER_SUMMARY_FIELDS],
    variables: { filters: { customer_id: req.params.id, is_draft_order: false }, ...pagination, order: { created_at: "DESC" } },
  } })
  if (!("rows" in result)) throw new Error("Order summary pagination was not returned")
  return res.json({ orders: result.rows.map(customerOrderSummary), count: result.metadata.count, offset: pagination.skip, limit: pagination.take })
}

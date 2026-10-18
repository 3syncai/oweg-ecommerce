import type { MedusaRequest } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/** Fulfillments are linked through Medusa's query graph, not an Order module relation. */
export async function getVendorRelocationOrder(req: MedusaRequest, orderId: string) {
  const orderModule = req.scope.resolve(Modules.ORDER)
  const order: any = await orderModule.retrieveOrder(orderId, { relations: ["items"] })
  const query = req.scope.resolve("query") as any
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "fulfillments.id", "fulfillments.canceled_at"],
    filters: { id: orderId },
  })
  return { ...order, fulfillments: data?.[0]?.fulfillments || [] }
}

import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import { syncProductToSearch } from "../utils/sync-product-search"

export default async function productCreatedHandler({
  event, container,
}: SubscriberArgs<{ id: string }>) {
  // Always fetch current persisted state; propagate failures for event-bus retry.
  await syncProductToSearch(container, event.data.id)
}

export const config: SubscriberConfig = { event: "product.created" }

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { enqueueNotification } from "../services/interakt/outbox"
export default async function whatsappOrderPlaced({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  // Async event handler: API failures never participate in the checkout transaction.
  await enqueueNotification(container, data.id, "order_placed")
}
export const config: SubscriberConfig = { event: "order.placed", context: { subscriberId: "whatsapp-order-placed" } }

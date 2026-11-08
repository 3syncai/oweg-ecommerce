import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { OrderWorkflowEvents } from "@medusajs/framework/utils"
import { enqueueNotification } from "../services/interakt/outbox"

export default async function whatsappOrderCanceled({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  // Medusa releases this grouped event only after cancelOrderWorkflow succeeds.
  // Enqueue also verifies persisted status; HTTP runs later in the existing job.
  await enqueueNotification(container, data.id, "order_cancelled")
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.CANCELED,
  context: { subscriberId: "whatsapp-order-canceled" },
}

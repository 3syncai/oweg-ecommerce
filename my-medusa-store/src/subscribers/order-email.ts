import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { FulfillmentWorkflowEvents, OrderWorkflowEvents } from "@medusajs/framework/utils"
import { enqueueOrderEmail } from "../services/order-email/outbox"

type EventData = { id: string; no_notification?: boolean }

export default async function orderEmail({ event: { name, data } }: SubscriberArgs<EventData>) {
  if (!data?.id || data.no_notification) return
  switch (name) {
    case OrderWorkflowEvents.PLACED:
      return enqueueOrderEmail({ orderId: data.id }, "order_placed")
    case OrderWorkflowEvents.CANCELED:
      return enqueueOrderEmail({ orderId: data.id }, "order_cancelled")
    case FulfillmentWorkflowEvents.SHIPMENT_CREATED:
      return enqueueOrderEmail({ fulfillmentId: data.id }, "order_shipped")
    case FulfillmentWorkflowEvents.DELIVERY_CREATED:
      return enqueueOrderEmail({ fulfillmentId: data.id }, "order_delivered")
  }
}

export const config: SubscriberConfig = {
  event: [
    OrderWorkflowEvents.PLACED, OrderWorkflowEvents.CANCELED,
    FulfillmentWorkflowEvents.SHIPMENT_CREATED, FulfillmentWorkflowEvents.DELIVERY_CREATED,
  ],
  context: { subscriberId: "oweg-order-email" },
}

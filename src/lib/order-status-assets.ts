import type { OrderDetail, ReturnRequest } from "@/lib/order-types";
import { getShiprocketStatusFromOrder, isPaymentConfirmed } from "@/lib/order-tracker";

export const ORDER_STATUS_IMAGES = {
  orderPlaced: "/images/order-status/01-order-placed.png",
  paymentConfirmed: "/images/order-status/02-payment-confirmed.png",
  preparingOrder: "/images/order-status/03-preparing-order.png",
  shipped: "/images/order-status/04-shipped.png",
  outForDelivery: "/images/order-status/05-out-for-delivery.png",
  arrivingToday: "/images/order-status/06-arriving-today.png",
  delivered: "/images/order-status/07-delivered.png",
  cancelled: "/images/order-status/08-cancelled.png",
  returnRequested: "/images/order-status/09-return-requested.png",
  refundProcessed: "/images/order-status/10-refund-processed.png",
} as const;

const SHIPPED_SHIPROCKET_STATUSES = [
  "in_transit",
  "shipped",
  "picked_up",
  "pickup_initiated",
  "pickup_scheduled",
];

export function resolveOrderStatusImage(
  order?: OrderDetail | null,
  existingReturn?: ReturnRequest | null
): string {
  if (!order) return ORDER_STATUS_IMAGES.orderPlaced;

  const orderStatus = (order.status || "").toLowerCase();
  if (orderStatus === "canceled" || orderStatus === "cancelled") {
    return ORDER_STATUS_IMAGES.cancelled;
  }

  if (existingReturn?.status === "refunded") {
    return ORDER_STATUS_IMAGES.refundProcessed;
  }

  if (existingReturn) {
    return ORDER_STATUS_IMAGES.returnRequested;
  }

  const shiprocketStatus = getShiprocketStatusFromOrder(order);
  const fulfillment = (order.fulfillment_status || "").toLowerCase();

  if (shiprocketStatus === "delivered" || fulfillment === "delivered") {
    return ORDER_STATUS_IMAGES.delivered;
  }

  if (shiprocketStatus === "out_for_delivery") {
    return ORDER_STATUS_IMAGES.outForDelivery;
  }

  if (
    SHIPPED_SHIPROCKET_STATUSES.includes(shiprocketStatus) ||
    fulfillment === "shipped" ||
    fulfillment === "partially_shipped"
  ) {
    return ORDER_STATUS_IMAGES.shipped;
  }

  if (isPaymentConfirmed(order)) {
    const isProcessing =
      orderStatus === "processing" ||
      fulfillment === "not_fulfilled" ||
      fulfillment === "partially_fulfilled";
    return isProcessing ? ORDER_STATUS_IMAGES.preparingOrder : ORDER_STATUS_IMAGES.paymentConfirmed;
  }

  return ORDER_STATUS_IMAGES.orderPlaced;
}

export function isCancelledStatusImage(src: string): boolean {
  return src === ORDER_STATUS_IMAGES.cancelled;
}

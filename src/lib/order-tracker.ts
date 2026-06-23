import type { OrderDetail, ReturnRequest, TrackerStep, TrackerStepKey } from "@/lib/order-types";

export function getDeliveryDate(order?: OrderDetail | null): Date | null {
  if (!order) return null;
  const meta = (order.metadata || {}) as Record<string, unknown>;
  const fulfillment = order.fulfillment_status || "";
  const delivered =
    (typeof meta.shiprocket_delivered_at === "string" && meta.shiprocket_delivered_at) ||
    (typeof meta.delivered_at === "string" && meta.delivered_at) ||
    ((order as { delivered_at?: string }).delivered_at || "") ||
    (fulfillment === "delivered" ? order.updated_at || order.created_at || "" : "");
  if (!delivered) return null;
  const parsed = new Date(delivered);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function getReturnDeadline(order?: OrderDetail | null): Date | null {
  const deliveryDate = getDeliveryDate(order);
  if (!deliveryDate) return null;
  const deadline = new Date(deliveryDate);
  deadline.setDate(deadline.getDate() + 7);
  return deadline;
}

export function isWithinReturnWindow(order?: OrderDetail | null): boolean {
  const deliveryDate = getDeliveryDate(order);
  const returnDeadline = getReturnDeadline(order);
  if (!deliveryDate || !returnDeadline) return false;
  return Date.now() <= returnDeadline.getTime();
}

export function isCodOrder(order?: OrderDetail | null): boolean {
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  const method = typeof meta.payment_method === "string" ? meta.payment_method.toLowerCase() : "";
  const payment = (order?.payment_status || "").toLowerCase();
  return method === "cod" || payment === "cod";
}

export function isCodConfirmed(order?: OrderDetail | null): boolean {
  if (!isCodOrder(order)) return false;
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  const codStatus = typeof meta.cod_status === "string" ? meta.cod_status.toLowerCase() : "";
  return codStatus === "confirmed";
}

function applyTrackerStageCascade(steps: TrackerStep[]): TrackerStep[] {
  let maxActiveIndex = -1;
  for (let i = 0; i < steps.length; i += 1) {
    if (steps[i].active) maxActiveIndex = i;
  }
  if (maxActiveIndex < 0) return steps;
  return steps.map((step, index) => ({
    ...step,
    active: index <= maxActiveIndex ? true : step.active,
  }));
}

function markCurrentTrackerStep(steps: TrackerStep[]): void {
  for (const step of steps) {
    step.current = false;
  }
  let currentSet = false;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].active && !currentSet) {
      steps[i].current = true;
      currentSet = true;
    }
  }
  if (!currentSet && steps[0]) steps[0].current = true;
}

export function canCancelOrder(
  order?: OrderDetail | null,
  existingReturn?: ReturnRequest | null,
  shiprocketStatus?: string
): boolean {
  if (!order?.id) return false;
  const blocked = ["picked_up", "in_transit", "out_for_delivery", "delivered", "shipped"];
  const status = shiprocketStatus ?? getShiprocketStatusFromOrder(order);
  const fulfillment = (order.fulfillment_status || "").toLowerCase();
  if (blocked.includes(status)) return false;
  if (fulfillment === "shipped" || fulfillment === "delivered") return false;
  const orderStatus = (order.status || "").toLowerCase();
  if (orderStatus === "canceled" || orderStatus === "cancelled") return false;
  return !existingReturn;
}

export function getShiprocketStatusFromOrder(order?: OrderDetail | null): string {
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  return typeof meta.shiprocket_status === "string" ? meta.shiprocket_status.toLowerCase() : "";
}

export function isPaymentConfirmed(order?: OrderDetail | null): boolean {
  const payment = (order?.payment_status || "").toLowerCase();
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  return payment === "captured" || payment === "paid" || meta.razorpay_payment_status === "captured";
}

export function trackerSteps(
  order?: OrderDetail | null,
  returnRequest?: ReturnRequest | null
): TrackerStep[] {
  const fulfillment = order?.fulfillment_status || "";
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  const shiprocketStatus = getShiprocketStatusFromOrder(order);
  const orderStatus = (order?.status || "").toLowerCase();
  const isCancelled = orderStatus === "canceled" || orderStatus === "cancelled";

  const shippedStates = ["shipped", "partially_shipped"];
  const deliveredStates = ["delivered"];
  const shiprocketShipped = [
    "picked_up",
    "pickup_scheduled",
    "pickup_initiated",
    "in_transit",
    "out_for_delivery",
    "shipped",
  ].includes(shiprocketStatus);
  const shiprocketDelivered = shiprocketStatus === "delivered";
  const paymentConfirmed = isPaymentConfirmed(order);
  const cod = isCodOrder(order);
  const codConfirmed = isCodConfirmed(order);
  const isProcessingStatus = orderStatus === "processing";

  if (isCancelled) {
    return [
      {
        key: "placed",
        label: "Order placed",
        active: true,
        tone: "default",
        timestamp: order?.created_at,
      },
      {
        key: "cancelled",
        label: "Order cancelled",
        active: true,
        current: true,
        tone: "cancelled",
        timestamp: order?.updated_at,
      },
    ];
  }

  const shippedActive =
    shiprocketShipped || shippedStates.includes(fulfillment) || deliveredStates.includes(fulfillment);
  const deliveredActive = shiprocketDelivered || deliveredStates.includes(fulfillment);
  const processingActive = cod
    ? codConfirmed || shippedActive || deliveredActive || isProcessingStatus
    : paymentConfirmed || shippedActive || deliveredActive || isProcessingStatus;

  const steps: TrackerStep[] = [
    {
      key: "placed",
      label: "Order placed",
      active: true,
      tone: "default",
      timestamp: order?.created_at,
      description: "We received your order.",
    },
    ...(cod
      ? []
      : [
          {
            key: "paid" as const,
            label: "Payment confirmed",
            active: paymentConfirmed,
            tone: "default" as const,
            timestamp: paymentConfirmed ? order?.created_at : undefined,
            description: "Payment verified successfully.",
          },
        ]),
    {
      key: "processing",
      label: "Processing",
      active: processingActive,
      tone: "default",
      timestamp: processingActive ? order?.updated_at : undefined,
      description: "Your order is being prepared.",
    },
    {
      key: "shipped",
      label: "Shipped",
      active: shippedActive,
      tone: "default",
      timestamp: shippedActive ? order?.updated_at : undefined,
      description: "Your package is on the way.",
    },
    {
      key: "delivered",
      label: "Delivered",
      active: deliveredActive,
      tone: "default",
      timestamp:
        (typeof meta.shiprocket_delivered_at === "string" && meta.shiprocket_delivered_at) ||
        (deliveredActive ? order?.updated_at : undefined),
      description: "Order delivered successfully.",
    },
  ];

  const cascadedSteps = applyTrackerStageCascade(steps);
  markCurrentTrackerStep(cascadedSteps);

  if (returnRequest) {
    const status = returnRequest.status;
    const labelMap: Record<string, string> = {
      pending_approval: "Return requested",
      approved: "Return approved",
      pickup_initiated: "Pickup scheduled",
      picked_up: "Return picked up",
      received: "Return received",
      refunded: "Refund completed",
      replaced: "Replacement shipped",
      rejected: "Return rejected",
      closed: "Return closed",
    };
    cascadedSteps.forEach((step) => {
      step.current = false;
    });
    cascadedSteps.push({
      key: "return",
      label: labelMap[status] || "Return in progress",
      active: true,
      current: true,
      tone: "default",
      description: `${returnRequest.type} request in progress.`,
    });
  }

  return cascadedSteps;
}

export function getTrackHeroContent(
  order?: OrderDetail | null,
  existingReturn?: ReturnRequest | null
) {
  const shiprocketStatus = getShiprocketStatusFromOrder(order);
  const fulfillment = (order?.fulfillment_status || "").toLowerCase();
  const orderStatus = (order?.status || "").toLowerCase();

  if (orderStatus === "canceled" || orderStatus === "cancelled") {
    return {
      title: "Cancelled",
      subtitle: "This order was cancelled.",
      description: "Contact support if you need help.",
    };
  }

  if (existingReturn?.status === "refunded") {
    return {
      title: "Refund Processed",
      subtitle: "Your refund has been completed",
      description: "The amount will reflect in your account as per bank timelines.",
    };
  }

  if (existingReturn) {
    return {
      title: "Return Requested",
      subtitle: "We are processing your return request",
      description: "You will receive updates as your return progresses.",
    };
  }

  if (shiprocketStatus === "delivered" || fulfillment === "delivered") {
    const deliveredAt = getDeliveryDate(order);
    return {
      title: "Delivered",
      subtitle: deliveredAt
        ? `Delivered on ${deliveredAt.toLocaleDateString("en-IN")}`
        : "Your order has been delivered",
      description: "Thank you for shopping with OWEG.",
    };
  }

  if (shiprocketStatus === "out_for_delivery") {
    return {
      title: "Out for Delivery",
      subtitle: "Arriving today — expected by end of day",
      description: "Your order is with the delivery partner.",
    };
  }

  if (
    ["in_transit", "shipped", "picked_up", "pickup_initiated", "pickup_scheduled"].includes(
      shiprocketStatus
    )
  ) {
    return {
      title: "Shipped",
      subtitle: "Your package is in transit",
      description: "We will notify you when it is out for delivery.",
    };
  }

  if (fulfillment === "shipped" || fulfillment === "partially_shipped") {
    return {
      title: "Shipped",
      subtitle: "Your order has left our warehouse",
      description: "Tracking updates will appear here.",
    };
  }

  if (isPaymentConfirmed(order)) {
    const isProcessing =
      orderStatus === "processing" ||
      fulfillment === "not_fulfilled" ||
      fulfillment === "partially_fulfilled";
    if (isProcessing) {
      return {
        title: "Preparing Order",
        subtitle: "We are getting your items ready",
        description: "You will receive tracking updates once shipped.",
      };
    }
    return {
      title: "Payment Confirmed",
      subtitle: "Payment verified successfully",
      description: "We will start preparing your order shortly.",
    };
  }

  if (isCodOrder(order)) {
    if (isCodConfirmed(order)) {
      return {
        title: "Preparing Order",
        subtitle: "We are getting your items ready",
        description: "You will receive tracking updates once shipped.",
      };
    }
    return {
      title: "Order Placed",
      subtitle: "We received your order",
      description: "We will confirm your COD order before preparation begins.",
    };
  }

  return {
    title: "Order Placed",
    subtitle: "We received your order",
    description: "You will receive updates once payment is confirmed.",
  };
}

export function getVerticalTrackingSteps(order?: OrderDetail | null): TrackerStep[] {
  let steps = trackerSteps(order);
  const shiprocketStatus = getShiprocketStatusFromOrder(order);

  if (shiprocketStatus === "out_for_delivery") {
    const shippedIndex = steps.findIndex((step) => step.key === "shipped");
    if (shippedIndex >= 0) {
      const shippedStep = { ...steps[shippedIndex], current: false };
      const outForDelivery: TrackerStep = {
        key: "shipped",
        label: "Out for delivery",
        active: true,
        tone: "default",
        timestamp: order?.updated_at,
        description: "Your order is with the delivery partner.",
      };
      steps = [
        ...steps.slice(0, shippedIndex),
        shippedStep,
        outForDelivery,
        ...steps.slice(shippedIndex + 1),
      ];
      steps = applyTrackerStageCascade(steps);
      markCurrentTrackerStep(steps);
    }
  }

  return steps;
}

export function getTrackerStepDetailIcon(
  key: TrackerStepKey
): "status-order-placed" | "payment-methods" | "status-processing" | "status-shipped" | "status-delivered" | "cancel-order" {
  const iconMap: Partial<
    Record<
      TrackerStepKey,
      "status-order-placed" | "payment-methods" | "status-processing" | "status-shipped" | "status-delivered" | "cancel-order"
    >
  > = {
    placed: "status-order-placed",
    paid: "payment-methods",
    processing: "status-processing",
    shipped: "status-shipped",
    delivered: "status-delivered",
    cancelled: "cancel-order",
  };
  return iconMap[key] || "status-processing";
}

export function getCurrentTrackerStepLabel(steps: TrackerStep[]): string {
  const current = steps.find((step) => step.current);
  if (current) return current.label;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].active) return steps[i].label;
  }
  return steps[0]?.label || "Order placed";
}

export function getOrderDetailStatusMessage(
  order?: OrderDetail | null,
  steps?: TrackerStep[] | null
): string {
  const hero = getTrackHeroContent(order);
  if (hero.subtitle && hero.description) {
    return `${hero.subtitle}. ${hero.description}`;
  }
  const current = steps?.find((step) => step.current);
  if (current?.description) return current.description;
  return "Status updates refresh as soon as your order progresses.";
}

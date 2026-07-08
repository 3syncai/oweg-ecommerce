/**
 * Determines whether a Medusa order should appear in the vendor portal.
 * Draft / unpaid checkout attempts must not show as placed orders.
 */
export type VendorOrderLike = {
  status?: string | null;
  is_draft_order?: boolean | null;
  metadata?: Record<string, unknown> | null;
  payment_status?: string | null;
};

export function isVendorVisibleOrder(order: VendorOrderLike | null | undefined): boolean {
  if (!order) return false;

  if (order.is_draft_order === true) return false;

  const status = typeof order.status === "string" ? order.status.toLowerCase() : "";
  if (status === "draft") return false;

  const metadata = (order.metadata || {}) as Record<string, unknown>;
  const checkoutStatus =
    typeof metadata.checkout_status === "string" ? metadata.checkout_status.toLowerCase() : "";
  if (checkoutStatus === "payment_failed") return false;

  const paymentMethod =
    typeof metadata.payment_method === "string" ? metadata.payment_method.toLowerCase() : "";
  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase()
      : "";
  const codStatus =
    typeof metadata.cod_status === "string" ? metadata.cod_status.toLowerCase() : "";
  const codPaymentStatus =
    typeof metadata.cod_payment_status === "string"
      ? metadata.cod_payment_status.toLowerCase()
      : "";
  const paymentStatus =
    typeof order.payment_status === "string" ? order.payment_status.toLowerCase() : "";

  if (status === "canceled" || status === "cancelled") {
    return paymentMethod === "cod"
      ? codStatus === "confirmed" || codPaymentStatus === "captured"
      : razorpayStatus === "captured" || ["captured", "paid"].includes(paymentStatus);
  }

  if (paymentMethod === "cod") {
    return codStatus === "confirmed" || codPaymentStatus === "captured";
  }

  if (paymentMethod === "razorpay" || razorpayStatus) {
    if (razorpayStatus === "failed" || razorpayStatus === "created") return false;
    return razorpayStatus === "captured" || ["captured", "paid"].includes(paymentStatus);
  }

  if (["captured", "paid"].includes(paymentStatus)) return true;

  if (razorpayStatus === "failed" || razorpayStatus === "created") return false;

  if (["not_paid", "awaiting", "requires_action"].includes(paymentStatus)) return false;

  return ["pending", "completed", "archived"].includes(status);
}

export function filterVendorVisibleOrders<T extends VendorOrderLike>(orders: T[]): T[] {
  return orders.filter(isVendorVisibleOrder);
}

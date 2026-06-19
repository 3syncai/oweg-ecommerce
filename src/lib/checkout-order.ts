import {
  convertDraftOrder,
  getDraftOrderById,
  getOrderById,
  updateDraftOrderMetadata,
  updateOrderMetadata,
} from "@/lib/medusa-admin";
import { applyCoinDiscountToOrder, syncOrderShippingAmount, syncOrderTaxInclusivePricing } from "@/lib/order-discount";
import { releaseOweg10Reservation } from "@/lib/oweg10";

export type CheckoutOrderRecord = Record<string, unknown> & {
  id?: string;
  status?: string;
  payment_status?: string;
  metadata?: Record<string, unknown> | null;
  is_draft_order?: boolean;
  customer_id?: string;
};

export function extractCheckoutOrder(data: unknown): CheckoutOrderRecord | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const direct = root.order || root.draft_order;
  if (direct && typeof direct === "object") return direct as CheckoutOrderRecord;
  const nested = root.data;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    const nestedOrder = nestedRecord.order || nestedRecord.draft_order;
    if (nestedOrder && typeof nestedOrder === "object") return nestedOrder as CheckoutOrderRecord;
    if (Array.isArray(nested) && nested[0] && typeof nested[0] === "object") {
      return nested[0] as CheckoutOrderRecord;
    }
  }
  return root as CheckoutOrderRecord;
}

export function isDraftCheckoutOrder(order: CheckoutOrderRecord | null | undefined): boolean {
  if (!order) return true;
  if (order.is_draft_order === true) return true;
  const status = typeof order.status === "string" ? order.status.toLowerCase() : "";
  return status === "draft";
}

export async function loadCheckoutOrder(orderId: string): Promise<{
  order: CheckoutOrderRecord;
  isDraft: boolean;
} | null> {
  const orderRes = await getOrderById(orderId);
  if (orderRes.ok && orderRes.data) {
    const order = extractCheckoutOrder(orderRes.data);
    if (order?.id) {
      return { order, isDraft: isDraftCheckoutOrder(order) };
    }
  }

  const draftRes = await getDraftOrderById(orderId);
  if (draftRes.ok && draftRes.data) {
    const order = extractCheckoutOrder(draftRes.data);
    if (order?.id) {
      return { order: { ...order, is_draft_order: true }, isDraft: true };
    }
  }

  return null;
}

export async function updateCheckoutOrderMetadata(
  orderId: string,
  isDraft: boolean,
  metadata: Record<string, unknown>
) {
  if (isDraft) {
    return updateDraftOrderMetadata(orderId, metadata);
  }
  return updateOrderMetadata(orderId, metadata);
}

export async function convertCheckoutDraftToPlacedOrder(draftOrderId: string): Promise<{
  orderId: string;
  order: CheckoutOrderRecord;
} | null> {
  const converted = await convertDraftOrder(draftOrderId);
  if (!converted.ok || !converted.data) return null;
  const order = extractCheckoutOrder(converted.data);
  if (!order?.id) return null;
  return { orderId: order.id, order };
}

export async function ensurePlacedCheckoutOrder(orderId: string): Promise<{
  orderId: string;
  order: CheckoutOrderRecord;
  converted: boolean;
} | null> {
  const loaded = await loadCheckoutOrder(orderId);
  if (!loaded) return null;

  if (!loaded.isDraft) {
    return { orderId: loaded.order.id || orderId, order: loaded.order, converted: false };
  }

  const converted = await convertCheckoutDraftToPlacedOrder(orderId);
  if (!converted) return null;
  return { ...converted, converted: true };
}

export async function runPostConvertCheckoutSideEffects(
  orderId: string,
  metadata: Record<string, unknown>
) {
  const expectedShipping =
    typeof metadata.expected_shipping_price === "number" ? metadata.expected_shipping_price : undefined;
  if (typeof expectedShipping === "number") {
    await syncOrderShippingAmount(orderId, expectedShipping);
  }

  const coinDiscountRupees =
    typeof metadata.coin_discount_rupees === "number"
      ? metadata.coin_discount_rupees
      : typeof metadata.coins_discounted === "number"
        ? metadata.coins_discounted
        : 0;

  const oweg10DiscountRupees =
    typeof metadata.oweg10_discount_rupees === "number" ? metadata.oweg10_discount_rupees : 0;

  const expectedGrandTotal =
    typeof metadata.medusa_total_minor === "number"
      ? metadata.medusa_total_minor / 100
      : typeof metadata.razorpay_amount_minor === "number"
        ? metadata.razorpay_amount_minor / 100
        : undefined;

  await syncOrderTaxInclusivePricing(orderId, {
    expectedGrandTotal,
    shippingRupees: expectedShipping,
    coinDiscountRupees,
    oweg10DiscountRupees,
  });

  if (coinDiscountRupees > 0) {
    await applyCoinDiscountToOrder({
      orderId,
      discountMinor: Math.round(coinDiscountRupees * 100),
    });
  }
}

export function isCustomerVisibleOrder(order: CheckoutOrderRecord): boolean {
  if (isDraftCheckoutOrder(order)) return false;

  const status = typeof order.status === "string" ? order.status.toLowerCase() : "";
  const metadata = (order.metadata || {}) as Record<string, unknown>;
  const paymentMethod =
    typeof metadata.payment_method === "string" ? metadata.payment_method.toLowerCase() : "";
  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase()
      : "";
  const codStatus = typeof metadata.cod_status === "string" ? metadata.cod_status.toLowerCase() : "";
  const paymentStatus =
    typeof order.payment_status === "string" ? order.payment_status.toLowerCase() : "";

  if (status === "canceled" || status === "cancelled") return true;
  if (paymentMethod === "cod" && codStatus === "confirmed") return true;
  if (["captured", "paid"].includes(paymentStatus)) return true;
  if (razorpayStatus === "captured") return true;

  if (paymentMethod === "razorpay" || razorpayStatus) {
    return false;
  }

  if (paymentMethod === "cod" && codStatus !== "confirmed") {
    return false;
  }

  if (["not_paid", "awaiting", "requires_action", "pending"].includes(paymentStatus)) {
    return false;
  }

  if (razorpayStatus === "created" || razorpayStatus === "failed") {
    return false;
  }

  return true;
}

export async function markCheckoutPaymentFailed(
  orderId: string,
  extraMetadata: Record<string, unknown> = {}
) {
  const loaded = await loadCheckoutOrder(orderId);
  if (!loaded) return;

  const metadata = (loaded.order.metadata || {}) as Record<string, unknown>;
  const reservationToken =
    typeof metadata.oweg10_reservation_token === "string"
      ? metadata.oweg10_reservation_token
      : undefined;
  const customerId =
    typeof metadata.oweg10_customer_id === "string"
      ? metadata.oweg10_customer_id
      : typeof loaded.order.customer_id === "string"
        ? loaded.order.customer_id
        : undefined;

  if (reservationToken && customerId) {
    await releaseOweg10Reservation(customerId, reservationToken).catch(() => undefined);
  }

  await updateCheckoutOrderMetadata(orderId, loaded.isDraft, {
    ...metadata,
    ...extraMetadata,
    razorpay_payment_status:
      typeof extraMetadata.razorpay_payment_status === "string"
        ? extraMetadata.razorpay_payment_status
        : "failed",
    checkout_status: "payment_failed",
    oweg10_pending: metadata.oweg10_applied ? false : metadata.oweg10_pending,
  });
}

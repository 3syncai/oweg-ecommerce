import {
  convertDraftOrder,
  getDraftOrderById,
  getOrderById,
  updateDraftOrderMetadata,
  updateOrderMetadata,
} from "@/lib/medusa-admin";
import { applyCoinDiscountToOrder, applyMetadataDiscountsToOrderSummary, syncOrderShippingAmount, syncOrderTaxInclusivePricing } from "@/lib/order-discount";
import { releaseOrderInventoryReservations } from "@/lib/medusa-payment";
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

  // Authorize convert so Medusa middleware allows it after verified payment.
  // Without this, unpaid Razorpay drafts stay blocked (inventory protection).
  // Also clear dismiss-tombstone flags so convert is not blocked by payment_failed.
  const metadata = (loaded.order.metadata || {}) as Record<string, unknown>;
  await updateCheckoutOrderMetadata(orderId, true, {
    ...metadata,
    checkout_convert_authorized: true,
    checkout_convert_authorized_at: new Date().toISOString(),
    checkout_status: "awaiting_payment",
    checkout_tombstone: false,
    checkout_failed_at: null,
  });

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

  const promoDiscountRupees =
    typeof metadata.promo_discount_rupees === "number"
      ? metadata.promo_discount_rupees
      : typeof metadata.promo_discount_minor === "number"
        ? metadata.promo_discount_minor / 100
        : 0;

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
    promoDiscountRupees,
  });

  // Absolute sync of coin + OWEG10 + promo into order_summary (admin/vendor totals).
  await applyMetadataDiscountsToOrderSummary(orderId);

  if (coinDiscountRupees > 0) {
    // Keep legacy coin adjustment path for older admin widgets that key off the flag.
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
  if (metadata.checkout_duplicate_suppressed === true) return false;

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

  if (
    razorpayStatus === "created" ||
    razorpayStatus === "failed" ||
    razorpayStatus === "attempted_failed"
  ) {
    return false;
  }

  return true;
}

/**
 * Soft-stamp an in-modal Razorpay `payment.failed` webhook.
 * Keeps the Medusa draft alive (no inventory release / coin refund / delete) so
 * Standard Checkout can retry another method on the same session.
 */
export async function recordCheckoutPaymentAttemptFailed(
  orderId: string,
  extraMetadata: Record<string, unknown> = {}
): Promise<{ ok: boolean; alreadyGone?: boolean; skippedTerminal?: boolean }> {
  const loaded = await loadCheckoutOrder(orderId);
  if (!loaded) {
    return { ok: true, alreadyGone: true };
  }

  const metadata = (loaded.order.metadata || {}) as Record<string, unknown>;
  const status =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase()
      : "";
  if (status === "captured" || status === "authorized" || status === "paid") {
    return { ok: true, skippedTerminal: true };
  }
  // Terminal abandon already happened (dismiss / payment-failed API).
  if (status === "failed" || String(metadata.checkout_status || "").toLowerCase() === "payment_failed") {
    return { ok: true, skippedTerminal: true };
  }

  await updateCheckoutOrderMetadata(orderId, loaded.isDraft, {
    ...metadata,
    ...extraMetadata,
    razorpay_payment_status: "attempted_failed",
    razorpay_last_attempt_failed_at: new Date().toISOString(),
    checkout_status: "awaiting_payment",
  });

  return { ok: true };
}

/**
 * Terminal payment abandon (modal dismiss / explicit cancel): release inventory/coupon
 * holds and soft-tombstone the draft (do NOT hard-delete).
 *
 * Hard-delete caused paid orphans when Razorpay captured after dismiss.
 * If Razorpay already has an authorized/captured payment for this draft's
 * razorpay_order_id, convert + finalize instead of abandoning.
 *
 * Do NOT call this from webhook `payment.failed` — that fires during in-modal retries.
 */
export async function markCheckoutPaymentFailed(
  orderId: string,
  extraMetadata: Record<string, unknown> = {}
): Promise<{
  ok: boolean;
  tombstoned?: boolean;
  recovered?: boolean;
  orderId?: string;
  alreadyGone?: boolean;
}> {
  const loaded = await loadCheckoutOrder(orderId);
  if (!loaded) {
    return { ok: true, alreadyGone: true };
  }

  const metadata = (loaded.order.metadata || {}) as Record<string, unknown>;
  const existingStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase()
      : "";
  if (existingStatus === "captured" || existingStatus === "authorized" || existingStatus === "paid") {
    // Already paid — never tombstone; ensure placed.
    if (loaded.isDraft) {
      const placed = await ensurePlacedCheckoutOrder(orderId);
      if (placed) {
        return { ok: true, recovered: true, orderId: placed.orderId };
      }
    }
    return { ok: true, recovered: true, orderId: loaded.order.id || orderId };
  }

  // Gate: if Razorpay already captured against this draft, recover instead of abandon.
  const razorpayOrderId =
    typeof metadata.razorpay_order_id === "string" ? metadata.razorpay_order_id : "";
  if (razorpayOrderId && loaded.isDraft) {
    try {
      const { getSuccessfulRazorpayPaymentForOrder, recoverRazorpayCapture } = await import(
        "@/lib/razorpay-capture-recover"
      );
      const successPay = await getSuccessfulRazorpayPaymentForOrder(razorpayOrderId);
      if (successPay?.id) {
        const recovered = await recoverRazorpayCapture({
          medusaOrderId: orderId,
          razorpayPaymentId: successPay.id,
          razorpayOrderId,
          amountMinor: typeof successPay.amount === "number" ? successPay.amount : undefined,
          currencyCode: successPay.currency,
        });
        if (recovered.ok) {
          return { ok: true, recovered: true, orderId: recovered.orderId };
        }
        console.warn("markCheckoutPaymentFailed: capture gate recover failed", recovered);
        // Fall through to tombstone — do not delete while recovery is ambiguous.
      }
    } catch (err) {
      console.warn("markCheckoutPaymentFailed: Razorpay gate check failed", err);
    }
  }

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

  // Free any Medusa stock holds — failed pay must not keep inventory reserved.
  await releaseOrderInventoryReservations(orderId).catch((err) => {
    console.warn("markCheckoutPaymentFailed: releaseOrderInventoryReservations failed", orderId, err);
  });

  const failedMetadata: Record<string, unknown> = {
    ...metadata,
    ...extraMetadata,
    razorpay_payment_status:
      typeof extraMetadata.razorpay_payment_status === "string"
        ? extraMetadata.razorpay_payment_status
        : "failed",
    checkout_status: "payment_failed",
    checkout_failed_at: new Date().toISOString(),
    checkout_convert_authorized: false,
    checkout_tombstone: true,
    oweg10_pending: metadata.oweg10_applied ? false : metadata.oweg10_pending,
  };

  await updateCheckoutOrderMetadata(orderId, loaded.isDraft, failedMetadata);

  // Keep the draft row as a tombstone so late webhook/confirm can still convert.
  // Do NOT call deleteDraftOrder — that created paid orphans after dismiss races.
  return { ok: true, tombstoned: true, orderId };
}

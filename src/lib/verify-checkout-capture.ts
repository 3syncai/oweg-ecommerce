import { loadCheckoutOrder } from "@/lib/checkout-order";
import { loadCheckoutPaymentSnapshot } from "@/lib/checkout-payment-snapshot";
import { fetchRazorpayPayment } from "@/lib/razorpay";
import { resolveOrderPayableAmountMinor } from "@/lib/medusa-payment";
import { assertCaptureFacts, CaptureVerificationError } from "@/lib/payment-capture-validation";

/** Verify with gateway and server-owned checkout facts before conversion or any paid-state writes. */
export async function verifyCheckoutCapture(input: {
  medusaOrderId: string;
  paymentId: string;
  gatewayOrderId: string;
  claimedAmountMinor?: number;
  claimedCurrency?: string;
}, preloadedOrder?: NonNullable<Awaited<ReturnType<typeof loadCheckoutOrder>>>) {
  // Only server-side callers can supply this request-scoped, already authorized record.
  if (preloadedOrder && preloadedOrder.order.id !== input.medusaOrderId) {
    throw new CaptureVerificationError("payment_order_mismatch");
  }
  const loaded = preloadedOrder ?? await loadCheckoutOrder(input.medusaOrderId);
  const snapshot = loaded ? null : await loadCheckoutPaymentSnapshot(input.medusaOrderId);
  if (!loaded && !snapshot) throw new CaptureVerificationError("checkout_reference_not_found", 404);
  const metadata = loaded?.order.metadata || snapshot?.metadata || {};
  const expectedGatewayOrderId = String(metadata.razorpay_order_id || snapshot?.razorpay_order_id || "");
  if (!expectedGatewayOrderId || expectedGatewayOrderId !== input.gatewayOrderId) throw new CaptureVerificationError("payment_order_mismatch");
  const amount = loaded ? await resolveOrderPayableAmountMinor(input.medusaOrderId, loaded.order.metadata || {}) :
    Number(metadata.medusa_total_minor ?? metadata.razorpay_amount_minor ?? Math.round(Number(snapshot?.total_rupees) * 100));
  if (!amount || !Number.isSafeInteger(amount)) throw new CaptureVerificationError("checkout_amount_unavailable");
  let payment;
  try { payment = await fetchRazorpayPayment(input.paymentId); }
  catch { throw new CaptureVerificationError("gateway_verification_unavailable", 503); }
  return assertCaptureFacts({ payment, paymentId: input.paymentId, gatewayOrderId: input.gatewayOrderId,
    expectedGatewayOrderId, expectedAmountMinor: amount,
    expectedCurrency: String(loaded?.order.currency_code || snapshot?.currency_code || "inr"),
    claimedAmountMinor: input.claimedAmountMinor, claimedCurrency: input.claimedCurrency });
}

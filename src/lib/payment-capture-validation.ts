export class CaptureVerificationError extends Error {
  constructor(public readonly code: string, public readonly status: number = 409) { super(code); }
}

export function assertCaptureFacts(input: {
  payment: { id: string; order_id?: string; amount: number; currency: string; status: string };
  paymentId: string;
  gatewayOrderId: string;
  expectedGatewayOrderId: string;
  expectedAmountMinor: number;
  expectedCurrency: string;
  claimedAmountMinor?: number;
  claimedCurrency?: string;
}) {
  const { payment } = input;
  if (payment.id !== input.paymentId || payment.order_id !== input.gatewayOrderId || input.gatewayOrderId !== input.expectedGatewayOrderId) {
    throw new CaptureVerificationError("payment_order_mismatch");
  }
  if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0 || payment.amount !== input.expectedAmountMinor) {
    throw new CaptureVerificationError("payment_amount_mismatch");
  }
  if (payment.currency.toLowerCase() !== input.expectedCurrency.toLowerCase()) throw new CaptureVerificationError("payment_currency_mismatch");
  if (input.claimedAmountMinor !== undefined && input.claimedAmountMinor !== payment.amount) throw new CaptureVerificationError("payment_amount_mismatch");
  if (input.claimedCurrency !== undefined && input.claimedCurrency.toLowerCase() !== payment.currency.toLowerCase()) throw new CaptureVerificationError("payment_currency_mismatch");
  // Authorization reserves funds; only a capture is a completed payment.
  if (payment.status !== "captured") throw new CaptureVerificationError("payment_not_captured");
  return { amountMinor: payment.amount, currencyCode: payment.currency.toLowerCase() };
}

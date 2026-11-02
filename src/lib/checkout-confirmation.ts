/** Read-only presentation of the same persisted flags used by payment-work-runner. */
export type ConfirmationSnapshot = {
  id?: string;
  status?: string;
  payment_status?: string;
  is_draft_order?: boolean;
  metadata?: Record<string, unknown> | null;
};
export function checkoutConfirmationState(order: ConfirmationSnapshot | null | undefined) {
  const metadata = order?.metadata || {};
  const value = (input: unknown) => typeof input === "string" ? input.toLowerCase() : "";
  const cod = value(metadata.payment_method) === "cod" || value(order?.payment_status) === "cod";
  const paid = ["paid", "captured"].includes(value(order?.payment_status)) || value(metadata.razorpay_payment_status) === "captured";
  const cancelled = ["canceled", "cancelled"].includes(value(order?.status));
  const draft = !order?.id || order.is_draft_order === true || value(order.status) === "draft";
  const complete = !draft && !cancelled && metadata.checkout_duplicate_suppressed !== true && (cod ? value(metadata.cod_status) === "confirmed" : paid);
  return { cod, paid, draft, cancelled, complete };
}

/** Back off sequentially; never multiply polling when another request is slow. */
export function confirmationPollDelay(attempt: number) {
  return attempt < 3 ? 1000 : attempt < 6 ? 2000 : attempt < 12 ? 5000 : 10000;
}

export function confirmationOrderHref(id: string) {
  return `/account/orders/${encodeURIComponent(id)}`;
}

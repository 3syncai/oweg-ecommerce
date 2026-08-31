/**
 * Determines whether a Medusa order should appear in the vendor portal.
 * Draft / unpaid checkout attempts must not show as placed orders.
 */
export type VendorOrderLike = {
  status?: string | null
  is_draft_order?: boolean | null
  metadata?: Record<string, unknown> | null
  payment_status?: string | null
}

export function isVendorVisibleOrder(order: VendorOrderLike | null | undefined): boolean {
  if (!order) return false

  if (order.is_draft_order === true) return false

  const status = typeof order.status === "string" ? order.status.toLowerCase() : ""
  if (status === "draft") return false

  const metadata = (order.metadata || {}) as Record<string, unknown>
  const checkoutStatus =
    typeof metadata.checkout_status === "string" ? metadata.checkout_status.toLowerCase() : ""
  if (checkoutStatus === "payment_failed") return false

  const paymentMethod =
    typeof metadata.payment_method === "string" ? metadata.payment_method.toLowerCase() : ""
  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase()
      : ""
  const codStatus =
    typeof metadata.cod_status === "string" ? metadata.cod_status.toLowerCase() : ""
  const codPaymentStatus =
    typeof metadata.cod_payment_status === "string"
      ? metadata.cod_payment_status.toLowerCase()
      : ""
  const paymentStatus =
    typeof order.payment_status === "string" ? order.payment_status.toLowerCase() : ""

  if (status === "canceled" || status === "cancelled") {
    return paymentMethod === "cod"
      ? codStatus === "confirmed" || codPaymentStatus === "captured"
      : razorpayStatus === "captured" || ["captured", "paid"].includes(paymentStatus)
  }

  if (paymentMethod === "cod") {
    return codStatus === "confirmed" || codPaymentStatus === "captured"
  }

  if (paymentMethod === "razorpay" || razorpayStatus) {
    if (razorpayStatus === "failed" || razorpayStatus === "created") return false
    return razorpayStatus === "captured" || ["captured", "paid"].includes(paymentStatus)
  }

  if (["captured", "paid"].includes(paymentStatus)) return true

  if (razorpayStatus === "failed" || razorpayStatus === "created") return false

  if (["not_paid", "awaiting", "requires_action"].includes(paymentStatus)) return false

  return ["pending", "completed", "archived"].includes(status)
}

/**
 * Same payment-readiness rules as vendor visibility: never book Shiprocket for
 * drafts, failed online checkouts, unconfirmed COD, or uncaptured Razorpay.
 */
export function isShiprocketEligibleOrder(order: VendorOrderLike | null | undefined): boolean {
  return isVendorVisibleOrder(order)
}

/**
 * Failed / incomplete online drafts must never convert — that is when Medusa
 * reserves inventory. Captured Razorpay, convert-authorized checkouts, and
 * non-Razorpay drafts (e.g. COD) are allowed.
 *
 * `checkout_convert_authorized` is set only by verified confirm/webhook/recover
 * after Razorpay HMAC/signature proof — it must override dismiss tombstones.
 */
export function isBlockedFromDraftConvert(order: VendorOrderLike | null | undefined): boolean {
  if (!order) return true

  const metadata = (order.metadata || {}) as Record<string, unknown>
  const checkoutStatus =
    typeof metadata.checkout_status === "string" ? metadata.checkout_status.toLowerCase() : ""
  const paymentMethod =
    typeof metadata.payment_method === "string" ? metadata.payment_method.toLowerCase() : ""
  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase()
      : ""
  const paymentStatus =
    typeof order.payment_status === "string" ? order.payment_status.toLowerCase() : ""
  const convertAuthorized =
    metadata.checkout_convert_authorized === true ||
    metadata.checkout_convert_authorized === "true"

  // Verified payment recovery / confirm always wins over tombstone flags.
  if (convertAuthorized) return false

  if (checkoutStatus === "payment_failed") return true
  if (razorpayStatus === "failed") return true

  if (paymentMethod === "razorpay" || razorpayStatus === "created") {
    if (razorpayStatus === "captured") return false
    if (["captured", "paid"].includes(paymentStatus)) return false
    // Incomplete / abandoned Razorpay draft — do not convert (would reserve stock)
    return true
  }

  return false
}

export function filterVendorVisibleOrders<T extends VendorOrderLike>(orders: T[]): T[] {
  return orders.filter(isVendorVisibleOrder)
}

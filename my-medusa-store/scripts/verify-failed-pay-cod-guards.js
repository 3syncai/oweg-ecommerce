/**
 * Lightweight regression checks for failed-online-pay → COD / Shiprocket guards.
 * Run: node scripts/verify-failed-pay-cod-guards.js
 */

function assert(cond, message) {
  if (!cond) {
    console.error("FAIL:", message)
    process.exit(1)
  }
}

/** Mirrors src/lib/vendor-order-visibility.ts isVendorVisibleOrder / isShiprocketEligibleOrder */
function isShiprocketEligibleOrder(order) {
  if (!order) return false
  if (order.is_draft_order === true) return false
  const status = typeof order.status === "string" ? order.status.toLowerCase() : ""
  if (status === "draft") return false
  const metadata = order.metadata || {}
  const checkoutStatus =
    typeof metadata.checkout_status === "string" ? metadata.checkout_status.toLowerCase() : ""
  if (checkoutStatus === "payment_failed") return false
  const paymentMethod =
    typeof metadata.payment_method === "string" ? metadata.payment_method.toLowerCase() : ""
  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase()
      : ""
  const codStatus = typeof metadata.cod_status === "string" ? metadata.cod_status.toLowerCase() : ""
  const codPaymentStatus =
    typeof metadata.cod_payment_status === "string"
      ? metadata.cod_payment_status.toLowerCase()
      : ""
  const paymentStatus =
    typeof order.payment_status === "string" ? order.payment_status.toLowerCase() : ""

  if (paymentMethod === "cod") {
    return codStatus === "confirmed" || codPaymentStatus === "captured"
  }
  if (paymentMethod === "razorpay" || razorpayStatus) {
    if (razorpayStatus === "failed" || razorpayStatus === "created") return false
    return razorpayStatus === "captured" || ["captured", "paid"].includes(paymentStatus)
  }
  if (["captured", "paid"].includes(paymentStatus)) return true
  if (["not_paid", "awaiting", "requires_action"].includes(paymentStatus)) return false
  return ["pending", "completed", "archived"].includes(status)
}

/** Mirrors assertEligibleForCodConfirm in checkout/cod/route.ts */
function assertEligibleForCodConfirm(metadata) {
  const paymentMethod =
    typeof metadata.payment_method === "string" ? metadata.payment_method.toLowerCase().trim() : ""
  const checkoutStatus =
    typeof metadata.checkout_status === "string" ? metadata.checkout_status.toLowerCase().trim() : ""
  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase().trim()
      : ""
  if (checkoutStatus === "payment_failed") {
    return "failed"
  }
  if (["failed", "created", "attempted_failed"].includes(razorpayStatus)) {
    return "unpaid-online"
  }
  if (paymentMethod && paymentMethod !== "cod") {
    return "wrong-method"
  }
  return null
}

/** Mirrors src/lib/vendor-order-visibility.ts isBlockedFromDraftConvert */
function isBlockedFromDraftConvert(order) {
  if (!order) return true
  const metadata = order.metadata || {}
  const checkoutStatus =
    typeof metadata.checkout_status === "string" ? metadata.checkout_status.toLowerCase() : ""
  if (checkoutStatus === "payment_failed") return true
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
  if (razorpayStatus === "failed") return true
  if (paymentMethod === "razorpay" || razorpayStatus === "created") {
    if (razorpayStatus === "captured") return false
    if (["captured", "paid"].includes(paymentStatus)) return false
    if (convertAuthorized) return false
    return true
  }
  return false
}

const base = (overrides = {}) => ({
  status: "pending",
  is_draft_order: false,
  payment_status: "not_paid",
  metadata: {},
  ...overrides,
})

assert(!isShiprocketEligibleOrder(null), "null not eligible")
assert(!isShiprocketEligibleOrder({ status: "draft" }), "draft not eligible")
assert(
  !isShiprocketEligibleOrder(
    base({ metadata: { payment_method: "razorpay", checkout_status: "payment_failed" } })
  ),
  "payment_failed not eligible"
)
assert(
  !isShiprocketEligibleOrder(
    base({ metadata: { payment_method: "razorpay", razorpay_payment_status: "created" } })
  ),
  "razorpay created not eligible"
)
assert(
  !isShiprocketEligibleOrder(
    base({ metadata: { payment_method: "razorpay", razorpay_payment_status: "failed" } })
  ),
  "razorpay failed not eligible"
)
assert(
  !isShiprocketEligibleOrder(base({ metadata: { payment_method: "cod" } })),
  "unconfirmed COD not eligible"
)
assert(
  isShiprocketEligibleOrder(
    base({ metadata: { payment_method: "cod", cod_status: "confirmed" } })
  ),
  "confirmed COD eligible"
)
assert(
  isShiprocketEligibleOrder(
    base({
      payment_status: "captured",
      metadata: { payment_method: "razorpay", razorpay_payment_status: "captured" },
    })
  ),
  "captured razorpay eligible"
)

assert(assertEligibleForCodConfirm({ payment_method: "cod" }) === null, "cod confirm ok")
assert(assertEligibleForCodConfirm({}) === null, "legacy empty ok")
assert(assertEligibleForCodConfirm({ payment_method: "razorpay" }) === "wrong-method", "razorpay blocked")
assert(
  assertEligibleForCodConfirm({ payment_method: "cod", checkout_status: "payment_failed" }) ===
    "failed",
  "failed blocked"
)
assert(
  assertEligibleForCodConfirm({
    payment_method: "razorpay",
    razorpay_payment_status: "created",
  }) === "unpaid-online",
  "created blocked"
)
assert(
  assertEligibleForCodConfirm({
    payment_method: "cod",
    razorpay_payment_status: "attempted_failed",
  }) === "unpaid-online",
  "attempted_failed blocked"
)

assert(
  isBlockedFromDraftConvert(
    base({ metadata: { payment_method: "razorpay", checkout_status: "payment_failed" } })
  ),
  "convert blocked payment_failed"
)
assert(
  isBlockedFromDraftConvert(
    base({ metadata: { payment_method: "razorpay", razorpay_payment_status: "created" } })
  ),
  "convert blocked created"
)
assert(
  isBlockedFromDraftConvert(
    base({ metadata: { payment_method: "razorpay", razorpay_payment_status: "failed" } })
  ),
  "convert blocked failed"
)
assert(
  !isBlockedFromDraftConvert(
    base({
      metadata: {
        payment_method: "razorpay",
        razorpay_payment_status: "created",
        checkout_convert_authorized: true,
      },
    })
  ),
  "convert allowed when authorized after verified pay"
)
assert(
  !isBlockedFromDraftConvert(
    base({
      metadata: { payment_method: "razorpay", razorpay_payment_status: "captured" },
    })
  ),
  "convert allowed captured"
)
assert(
  !isBlockedFromDraftConvert(base({ metadata: { payment_method: "cod" } })),
  "convert allowed COD draft"
)

console.log("verify-flows: all assertions passed")

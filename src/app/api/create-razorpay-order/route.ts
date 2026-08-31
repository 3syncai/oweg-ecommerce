import { NextResponse } from "next/server";
import { createRazorpayOrder, fetchRazorpayOrder, getPublicRazorpayKey } from "@/lib/razorpay";
import { loadCheckoutOrder, updateCheckoutOrderMetadata } from "@/lib/checkout-order";
import { getPool } from "@/lib/wallet-ledger";
import { persistSnapshotForCheckout } from "@/lib/checkout-payment-snapshot";

export const dynamic = "force-dynamic";

const DEFAULT_CURRENCY = "INR";
const AMOUNT_TOLERANCE_RUPEES = 1;
const isDev = process.env.NODE_ENV !== "production";

type RequestBody = {
  medusaOrderId?: string;
  amount?: number;
};

type MedusaOrder = {
  id?: string;
  metadata?: Record<string, unknown>;
  currency_code?: string;
  total?: number;
};

type CreateRazorpaySuccess = {
  orderId: string;
  key: string;
  amount: number;
  currency: string;
};

/** Coalesce concurrent creates for the same Medusa draft (double-click / parallel fetch). */
type CreateResult = { status: number; body: Record<string, unknown> };
const inFlightByOrderId = new Map<string, Promise<CreateResult>>();

function badRequest(message: string, code?: string): CreateResult {
  return { status: 400, body: { error: message, ...(code ? { code } : {}) } };
}

function jsonResult(status: number, body: Record<string, unknown>): CreateResult {
  return { status, body };
}

async function readOrderPayableRupees(orderId: string, fallback: number): Promise<number> {
  if (!process.env.DATABASE_URL) return fallback;
  try {
    const pool = getPool();
    const res = await pool.query(
      `SELECT totals FROM order_summary WHERE order_id = $1 LIMIT 1`,
      [orderId]
    );
    const totals = (res.rows[0]?.totals || {}) as Record<string, unknown>;
    const current = Number(totals.current_order_total ?? 0);
    const pending = Number(totals.pending_difference ?? 0);
    if (current > 0) return current;
    if (pending > 0) return pending;
  } catch (err) {
    if (isDev) {
      console.warn("readOrderPayableRupees failed", err);
    }
  }
  return fallback;
}

function isTerminalFailedSession(razorpayPaymentStatus: string, checkoutStatus: string) {
  return (
    razorpayPaymentStatus === "failed" ||
    checkoutStatus === "payment_failed" ||
    razorpayPaymentStatus === "captured" ||
    razorpayPaymentStatus === "paid" ||
    razorpayPaymentStatus === "authorized"
  );
}

async function tryReuseCachedRazorpayOrder(params: {
  cachedRazorpayOrderId: string;
  totalRupees: number;
  currency: string;
  razorpayPaymentStatus: string;
  checkoutStatus: string;
}): Promise<CreateRazorpaySuccess | null> {
  const {
    cachedRazorpayOrderId,
    totalRupees,
    currency,
    razorpayPaymentStatus,
    checkoutStatus,
  } = params;

  if (!cachedRazorpayOrderId || isTerminalFailedSession(razorpayPaymentStatus, checkoutStatus)) {
    return null;
  }

  const expectedAmountPaise = Math.round(totalRupees * 100);
  let cachedAmountPaise: number | null = null;
  let cachedRzpStatus: string | null = null;

  try {
    const cachedOrder = await fetchRazorpayOrder(cachedRazorpayOrderId);
    cachedAmountPaise = Math.round(Number(cachedOrder.amount) || 0);
    cachedRzpStatus =
      typeof cachedOrder.status === "string" ? cachedOrder.status.toLowerCase() : null;
  } catch (err) {
    if (isDev) {
      console.warn("[create-razorpay-order] failed to fetch cached Razorpay order", err);
    }
    return null;
  }

  const rzpNotRetryable =
    cachedRzpStatus === "paid" ||
    cachedRzpStatus === "captured" ||
    cachedRzpStatus === "cancelled" ||
    cachedRzpStatus === "canceled";

  if (
    !rzpNotRetryable &&
    cachedAmountPaise !== null &&
    Math.abs(cachedAmountPaise - expectedAmountPaise) <= 100
  ) {
    return {
      orderId: cachedRazorpayOrderId,
      key: getPublicRazorpayKey(),
      amount: expectedAmountPaise,
      currency,
    };
  }

  return null;
}

async function createRazorpayOrderForMedusa(
  medusaOrderId: string,
  requestedAmount: number
): Promise<CreateResult> {
  const loaded = await loadCheckoutOrder(medusaOrderId);
  if (!loaded) {
    return jsonResult(404, { error: "Order not found" });
  }
  const order = loaded.order as MedusaOrder;
  const metadata = (order.metadata || {}) as Record<string, unknown>;

  const paymentMethod =
    typeof metadata.payment_method === "string" ? metadata.payment_method.toLowerCase() : "";
  if (paymentMethod === "cod") {
    return badRequest(
      "Cash on delivery checkout cannot create a Razorpay order",
      "cod_checkout_no_razorpay"
    );
  }

  const currency = (order.currency_code || DEFAULT_CURRENCY).toString().toUpperCase();
  const orderTotalRupees = Number.isFinite(Number(order.total ?? 0)) ? Number(order.total ?? 0) : 0;
  const summaryPayable = await readOrderPayableRupees(medusaOrderId, orderTotalRupees);
  const totalRupees = summaryPayable > 0 ? summaryPayable : orderTotalRupees;
  if (totalRupees <= 0) {
    return badRequest("Order total is invalid");
  }

  if (!Number.isNaN(requestedAmount) && requestedAmount > 0) {
    if (Math.abs(requestedAmount - totalRupees) > AMOUNT_TOLERANCE_RUPEES) {
      return badRequest("Payment amount does not match order total");
    }
  }

  const cachedRazorpayOrderId =
    typeof metadata.razorpay_order_id === "string" ? metadata.razorpay_order_id : "";
  const razorpayPaymentStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase()
      : "";
  const checkoutStatus =
    typeof metadata.checkout_status === "string" ? metadata.checkout_status.toLowerCase() : "";

  // Terminal dismiss tombstone: do not mint another RZP order on this draft.
  // Client must create a fresh Medusa draft (Pay again). Soft in-modal
  // `attempted_failed` is allowed to reuse/retry on the same draft.
  if (
    checkoutStatus === "payment_failed" ||
    metadata.checkout_tombstone === true ||
    razorpayPaymentStatus === "failed"
  ) {
    return badRequest(
      "This checkout session was cancelled. Start payment again from checkout.",
      "checkout_tombstoned"
    );
  }

  const reused = await tryReuseCachedRazorpayOrder({
    cachedRazorpayOrderId,
    totalRupees,
    currency,
    razorpayPaymentStatus,
    checkoutStatus,
  });
  if (reused) {
    await persistSnapshotForCheckout(medusaOrderId, reused.orderId);
    return jsonResult(200, reused);
  }

  // Re-load under coalesce: a twin request may have finished minting while we waited.
  const reloaded = await loadCheckoutOrder(medusaOrderId);
  if (reloaded) {
    const meta2 = (reloaded.order.metadata || {}) as Record<string, unknown>;
    const cached2 =
      typeof meta2.razorpay_order_id === "string" ? meta2.razorpay_order_id : "";
    const status2 =
      typeof meta2.razorpay_payment_status === "string"
        ? meta2.razorpay_payment_status.toLowerCase()
        : "";
    const checkout2 =
      typeof meta2.checkout_status === "string" ? meta2.checkout_status.toLowerCase() : "";
    const reused2 = await tryReuseCachedRazorpayOrder({
      cachedRazorpayOrderId: cached2,
      totalRupees,
      currency,
      razorpayPaymentStatus: status2,
      checkoutStatus: checkout2,
    });
    if (reused2) {
      return jsonResult(200, reused2);
    }
  }

  // Best-effort cross-request stamp (helps multi-instance; coalesce handles same process).
  try {
    await updateCheckoutOrderMetadata(medusaOrderId, loaded.isDraft, {
      ...metadata,
      razorpay_order_minting_at: new Date().toISOString(),
    });
  } catch {
    // continue
  }

  const rzpOrder = await createRazorpayOrder(
    {
      amount: totalRupees,
      currency,
      receipt: medusaOrderId,
      notes: {
        medusa_order_id: medusaOrderId,
      },
    },
    { amountIsPaise: false }
  );

  const baseMeta = ((reloaded || loaded).order.metadata || {}) as Record<string, unknown>;
  const nextMetadata = {
    ...baseMeta,
    razorpay_order_id: rzpOrder.id,
    razorpay_payment_status: "created",
    checkout_status: "awaiting_payment",
    checkout_failed_at: null,
    razorpay_last_attempt_failed_at: null,
    razorpay_order_minting_at: null,
  };

  await updateCheckoutOrderMetadata(
    medusaOrderId,
    (reloaded || loaded).isDraft,
    nextMetadata
  );

  await persistSnapshotForCheckout(medusaOrderId, rzpOrder.id);

  return jsonResult(200, {
    orderId: rzpOrder.id,
    key: getPublicRazorpayKey(),
    amount: rzpOrder.amount,
    currency: rzpOrder.currency,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const medusaOrderId = body.medusaOrderId?.trim();
    if (!medusaOrderId) {
      return NextResponse.json({ error: "medusaOrderId is required" }, { status: 400 });
    }

    if (isDev) {
      console.log("[create-razorpay-order] medusaOrderId:", medusaOrderId);
    }

    const requestedAmount = Number(body.amount);

    let work = inFlightByOrderId.get(medusaOrderId);
    if (!work) {
      work = createRazorpayOrderForMedusa(medusaOrderId, requestedAmount).finally(() => {
        inFlightByOrderId.delete(medusaOrderId);
      });
      inFlightByOrderId.set(medusaOrderId, work);
    }

    const result = await work;
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to create Razorpay order";
    console.error("create-razorpay-order failed", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

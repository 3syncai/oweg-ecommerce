import { NextResponse } from "next/server";
import { getOrderById } from "@/lib/medusa-admin";
import { getPool } from "@/lib/wallet-ledger";

export type ParsedOrder = {
  id: string;
  customerId: string | null;
  metadata: Record<string, unknown>;
  paymentStatus: string;
  status: string;
};

function extractOrder(payload: Record<string, unknown> | null): ParsedOrder | null {
  if (!payload || typeof payload !== "object") return null;

  const order =
    "order" in payload && payload.order && typeof payload.order === "object"
      ? (payload.order as Record<string, unknown>)
      : payload;

  const id = typeof order.id === "string" ? order.id : null;
  if (!id) return null;

  const customerId =
    typeof order.customer_id === "string"
      ? order.customer_id
      : typeof order.customerId === "string"
        ? order.customerId
        : null;

  return {
    id,
    customerId,
    metadata: (order.metadata as Record<string, unknown> | undefined) || {},
    paymentStatus:
      typeof order.payment_status === "string" ? order.payment_status.toLowerCase() : "",
    status: typeof order.status === "string" ? order.status.toLowerCase() : "",
  };
}

export async function loadParsedOrder(orderId: string): Promise<ParsedOrder | null> {
  const orderRes = await getOrderById(orderId);
  if (!orderRes.ok || !orderRes.data) return null;
  return extractOrder(orderRes.data as Record<string, unknown>);
}

export function orderForbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function assertOrderOwnedByCustomer(
  orderId: string,
  customerId: string
): Promise<{ order: ParsedOrder } | { errorResponse: NextResponse }> {
  const order = await loadParsedOrder(orderId);
  if (!order) {
    return { errorResponse: NextResponse.json({ error: "Order not found" }, { status: 404 }) };
  }
  if (!order.customerId || order.customerId !== customerId) {
    return { errorResponse: orderForbiddenResponse() };
  }
  return { order };
}

/** Customer-initiated coin refunds are allowed only before payment is captured. */
export function isOrderEligibleForCustomerCoinRefund(order: ParsedOrder): boolean {
  const metadata = order.metadata;
  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase()
      : "";
  const checkoutStatus =
    typeof metadata.checkout_status === "string" ? metadata.checkout_status.toLowerCase() : "";

  if (["captured", "paid"].includes(order.paymentStatus)) return false;
  if (razorpayStatus === "captured") return false;
  if (order.status === "completed") return false;

  if (checkoutStatus === "payment_failed") return true;
  if (razorpayStatus === "failed") return true;
  if (razorpayStatus === "created") return true;

  return false;
}

export async function resolveOrderPayableRupeesFromDb(orderId: string): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const pool = getPool();
    const summaryResult = await pool.query(
      `SELECT totals FROM order_summary WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );
    const totals = (summaryResult.rows[0]?.totals || {}) as Record<string, unknown>;
    const current = Number(totals.current_order_total ?? 0);
    const pending = Number(totals.pending_difference ?? 0);
    if (current > 0) return current;
    if (pending > 0) return pending;

    const orderResult = await pool.query(`SELECT total FROM "order" WHERE id = $1`, [orderId]);
    const total = Number(orderResult.rows[0]?.total ?? 0);
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

export async function resolveOrderEarnContext(orderId: string): Promise<{
  customerId: string;
  orderTotalRupees: number;
} | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const pool = getPool();
    const orderResult = await pool.query(
      `SELECT customer_id, total FROM "order" WHERE id = $1`,
      [orderId]
    );
    const customerId = orderResult.rows[0]?.customer_id as string | undefined;
    if (!customerId) return null;

    const orderTotalRupees = (await resolveOrderPayableRupeesFromDb(orderId)) ?? 0;
    if (orderTotalRupees <= 0) return null;

    return { customerId, orderTotalRupees };
  } catch {
    return null;
  }
}

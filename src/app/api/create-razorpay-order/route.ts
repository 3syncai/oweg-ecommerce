import { NextResponse } from "next/server";
import { createRazorpayOrder, getPublicRazorpayKey } from "@/lib/razorpay";
import { loadCheckoutOrder, updateCheckoutOrderMetadata } from "@/lib/checkout-order";
import { getPool } from "@/lib/wallet-ledger";

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

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const medusaOrderId = body.medusaOrderId?.trim();
    if (!medusaOrderId) {
      return badRequest("medusaOrderId is required");
    }

    if (isDev) {
      console.log("[create-razorpay-order] medusaOrderId:", medusaOrderId);
    }

    const loaded = await loadCheckoutOrder(medusaOrderId);
    if (!loaded) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const order = loaded.order as MedusaOrder;

    const currency = (order.currency_code || DEFAULT_CURRENCY).toString().toUpperCase();
    const orderTotalRupees = Number.isFinite(Number(order.total ?? 0)) ? Number(order.total ?? 0) : 0;
    const summaryPayable = await readOrderPayableRupees(medusaOrderId, orderTotalRupees);
    const totalRupees = summaryPayable > 0 ? summaryPayable : orderTotalRupees;
    if (totalRupees <= 0) {
      return badRequest("Order total is invalid");
    }

    const requestedAmount = Number(body.amount);
    if (!Number.isNaN(requestedAmount) && requestedAmount > 0) {
      if (Math.abs(requestedAmount - totalRupees) > AMOUNT_TOLERANCE_RUPEES) {
        return badRequest("Payment amount does not match order total");
      }
    }

    const metadata = (order.metadata || {}) as Record<string, unknown>;
    if (typeof metadata.razorpay_order_id === "string" && metadata.razorpay_order_id) {
      return NextResponse.json({
        orderId: metadata.razorpay_order_id,
        key: getPublicRazorpayKey(),
        amount: Math.round(totalRupees * 100),
        currency,
      });
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

    const nextMetadata = {
      ...metadata,
      razorpay_order_id: rzpOrder.id,
      razorpay_payment_status: "created",
    };

    await updateCheckoutOrderMetadata(medusaOrderId, loaded.isDraft, nextMetadata);

    return NextResponse.json({
      orderId: rzpOrder.id,
      key: getPublicRazorpayKey(),
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to create Razorpay order";
    console.error("create-razorpay-order failed", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

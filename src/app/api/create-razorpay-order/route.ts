import { NextResponse } from "next/server";
import { createRazorpayOrder, getPublicRazorpayKey } from "@/lib/razorpay";
import { convertDraftOrder, getOrderById, updateOrderMetadata } from "@/lib/medusa-admin";
import { getPool } from "@/lib/wallet-ledger";

export const dynamic = "force-dynamic";

const DEFAULT_CURRENCY = "INR";

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

function extractOrder(data: unknown): MedusaOrder | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const direct = root.order;
  if (direct && typeof direct === "object") return direct as MedusaOrder;
  const nested = root.data;
  if (nested && typeof nested === "object") {
    const nestedOrder = (nested as Record<string, unknown>).order;
    if (nestedOrder && typeof nestedOrder === "object") return nestedOrder as MedusaOrder;
    if (Array.isArray(nested) && nested[0] && typeof nested[0] === "object") {
      return nested[0] as MedusaOrder;
    }
  }
  return root as MedusaOrder;
}

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
    console.warn("readOrderPayableRupees failed", err);
  }
  return fallback;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    console.log("🔥🔥🔥 [Razorpay Debug] Incoming Body:", JSON.stringify(body, null, 2));

    let medusaOrderId = body.medusaOrderId?.trim();

    if (!medusaOrderId) {
      return badRequest("medusaOrderId is required");
    }

    let order: MedusaOrder | null = null;

    const orderRes = await getOrderById(medusaOrderId);
    if (orderRes.status === 0) {
      return NextResponse.json(
        { error: "Medusa admin backend is temporarily unavailable. Please retry." },
        { status: 503 }
      );
    }
    if (orderRes.ok && orderRes.data && extractOrder(orderRes.data)) {
      order = extractOrder(orderRes.data);
    } else {
      // If we only have a draft id, convert it so Razorpay can reference a real order
      const converted = await convertDraftOrder(medusaOrderId);
      if (converted.status === 0) {
        return NextResponse.json(
          { error: "Medusa admin backend is temporarily unavailable. Please retry." },
          { status: 503 }
        );
      }
      if (converted.ok) {
        const convertedOrder = extractOrder(converted.data);
        if (convertedOrder?.id) {
          medusaOrderId = convertedOrder.id;
          order = convertedOrder;
        }
      }
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const currency = (order.currency_code || DEFAULT_CURRENCY).toString().toUpperCase();
    const orderTotalRupees = Number.isFinite(Number(order.total ?? 0)) ? Number(order.total ?? 0) : 0;
    const summaryPayable = await readOrderPayableRupees(medusaOrderId, orderTotalRupees);
    const totalRupees = summaryPayable > 0 ? summaryPayable : orderTotalRupees;
    if (totalRupees <= 0) {
      return badRequest("Order total is invalid");
    }

    let finalAmount = totalRupees;
    const requestedAmount = Number(body.amount);

    if (!isNaN(requestedAmount) && requestedAmount > 0) {
      console.log(`💰 [Razorpay Force] Override: Order says ${totalRupees}, Frontend says ${requestedAmount}`);
      finalAmount = requestedAmount;
    } else {
      console.log(`⚠️ [Razorpay Debug] No valid amount override provided. Using payable total: ${totalRupees}`);
    }

    const metadata = (order.metadata || {}) as Record<string, unknown>;
    if (typeof metadata.razorpay_order_id === "string" && metadata.razorpay_order_id) {
      // CHECK IF EXISTING ORDER AMOUNT MATCHES (approximate check)
      // We don't store the exact amount in metadata usually, but we can check if coin discount changed
      // For safety: If we have an explicit override amount from frontend, and it differs from totalRupees,
      // we should probably CREATE A NEW ONE to be safe, or just ignore the cache if coin discount is active.

      if (Math.abs(finalAmount - totalRupees) > 1) {
        console.log("💰 [Razorpay Refresh] Discount active, ignoring cached order ID to force new amount");
        // Fall through to create new order
      } else {
        return NextResponse.json({
          orderId: metadata.razorpay_order_id,
          key: getPublicRazorpayKey(),
          amount: Math.round(finalAmount * 100),
          currency,
        });
      }
    }

    const rzpOrder = await createRazorpayOrder(
      {
        amount: finalAmount, // Use the forced amount
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

    await updateOrderMetadata(medusaOrderId, nextMetadata);

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

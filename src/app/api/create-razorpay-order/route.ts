import { NextResponse } from "next/server";
import { createRazorpayOrder, getPublicRazorpayKey } from "@/lib/razorpay";
import { convertDraftOrder, getOrderById, updateOrderMetadata } from "@/lib/medusa-admin";

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
    if (orderRes.ok && orderRes.data && extractOrder(orderRes.data)) {
      order = extractOrder(orderRes.data);
    } else {
      // If we only have a draft id, convert it so Razorpay can reference a real order
      const converted = await convertDraftOrder(medusaOrderId);
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
    // order.total is in rupees - pass as-is to razorpay helper which will convert to paise
    const totalRupees = Number.isFinite(Number(order.total ?? 0)) ? Number(order.total ?? 0) : 0;
    if (totalRupees <= 0) {
      return badRequest("Order total is invalid");
    }

    // SECURITY FIX: Server-side validation of payment amount
    // Prevent clients from bypassing pricing by sending arbitrary amounts
    let finalAmount = totalRupees;
    const requestedAmount = Number(body.amount);

    if (!isNaN(requestedAmount) && requestedAmount > 0) {
      // Check if the requested amount is within acceptable tolerance (5%)
      // This allows for minor rounding differences but prevents major bypass attempts
      const tolerance = totalRupees * 0.05; // 5% tolerance
      const minAcceptable = totalRupees - tolerance;

      if (requestedAmount < minAcceptable) {
        console.error(`🚨 [Razorpay Security] Payment bypass attempt! Order: ${totalRupees}, Requested: ${requestedAmount}`);
        return badRequest(`Invalid payment amount. Order total is ₹${totalRupees.toFixed(2)}`);
      }

      // If amount is lower (within tolerance), it's likely a coin discount - allow but log
      if (requestedAmount < totalRupees) {
        console.log(`💰 [Razorpay] Discounted amount: Order=${totalRupees}, Paying=${requestedAmount} (discount of ₹${(totalRupees - requestedAmount).toFixed(2)})`);
      }

      finalAmount = requestedAmount;
    } else {
      console.log(`⚠️ [Razorpay Debug] No valid amount override provided. Using calculated total: ${totalRupees}`);
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
          amount: totalRupees,
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

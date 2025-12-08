import { NextResponse } from "next/server";
import { createRazorpayOrder, getPublicRazorpayKey } from "@/lib/razorpay";
import { convertDraftOrder, getOrderById, updateOrderMetadata } from "@/lib/medusa-admin";

export const dynamic = "force-dynamic";

const DEFAULT_CURRENCY = "INR";
const MOCK_RAZORPAY = process.env.MOCK_RAZORPAY === "true";

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

    if (typeof body.amount === "number" && Math.abs(body.amount - totalRupees) > 1) {
      return badRequest("Amount mismatch");
    }

    const metadata = (order.metadata || {}) as Record<string, unknown>;
<<<<<<< HEAD
  if (typeof metadata.razorpay_order_id === "string" && metadata.razorpay_order_id) {
    return NextResponse.json({
      orderId: metadata.razorpay_order_id,
      key: getPublicRazorpayKey(),
      amount: expected,
      currency,
    });
  }

  if (MOCK_RAZORPAY) {
    const mockKey =
      process.env.MOCK_RAZORPAY_PUBLIC_KEY ||
      process.env.NEXT_PUBLIC_MOCK_RAZORPAY_PUBLIC_KEY ||
      "rzp_test_mock_key";
    const mockId = `mock_rzp_${Date.now()}`;
    await updateOrderMetadata(medusaOrderId, {
      ...metadata,
      razorpay_order_id: mockId,
      razorpay_payment_status: "created",
    });
    return NextResponse.json({
      orderId: mockId,
      key: mockKey,
      amount: expected,
      currency,
      mock: true,
    });
  }
=======
    if (typeof metadata.razorpay_order_id === "string" && metadata.razorpay_order_id) {
      return NextResponse.json({
        orderId: metadata.razorpay_order_id,
        key: getPublicRazorpayKey(),
        amount: totalRupees,
        currency,
      });
    }
>>>>>>> origin/razorpay

    const rzpOrder = await createRazorpayOrder(
      {
        // Medusa totals are in major unit (rupees); let helper convert to paise
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

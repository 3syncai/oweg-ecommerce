import { NextResponse } from "next/server";
import { getOrderById, readStoreCart } from "@/lib/medusa-admin";

export const dynamic = "force-dynamic";

type MedusaOrder = {
  id?: string;
  display_id?: number | string;
  status?: string;
  payment_status?: string;
  fulfillment_status?: string;
  is_draft_order?: boolean;
  email?: string;
  currency_code?: string;
  total?: number;
  subtotal?: number;
  tax_total?: number;
  shipping_total?: number;
  items?: Array<Record<string, unknown>>;
  shipping_address?: Record<string, unknown>;
  billing_address?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
  }
  return root as MedusaOrder;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") || url.searchParams.get("id");
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const orderRes = await getOrderById(orderId);
  const order = orderRes.data ? extractOrder(orderRes.data) : null;
  if (!orderRes.ok || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const metadata = (order.metadata || {}) as Record<string, unknown>;

  const items = Array.isArray(order.items)
    ? order.items.map((item: unknown) => {
        const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          id: record.id as string | number | undefined,
          title: (record.title as string) || (record.product_title as string),
          quantity: record.quantity as number,
          unit_price: record.unit_price as number,
          total: record.total as number,
          thumbnail: (record.thumbnail as string) || (record.image_url as string),
        };
      })
    : [];

  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string" ? metadata.razorpay_payment_status : undefined;
  const payment_status =
    razorpayStatus === "captured" ? "paid" : (order.payment_status as string | undefined);

  const paid_total =
    typeof metadata.medusa_total_minor === "number"
      ? metadata.medusa_total_minor
      : (order.total as number | undefined);

  return NextResponse.json({
    order: {
      id: order.id,
      display_id: order.display_id,
      status: order.status,
      payment_status,
      fulfillment_status: order.fulfillment_status,
      is_draft_order: order.is_draft_order,
      email: order.email,
      currency_code: order.currency_code,
      total: order.total,
      paid_total,
      subtotal: order.subtotal,
      tax_total: order.tax_total,
      shipping_total: order.shipping_total,
      items,
      shipping_address: order.shipping_address,
      billing_address: order.billing_address,
      metadata,
    },
  });
}

type SummaryBody = {
  mode?: "buy_now" | "cart";
  cartId?: string | null;
  guestCartId?: string | null;
  shippingMethod?: string;
  shippingPrice?: number;
  itemsOverride?: Array<{ variant_id: string; quantity: number; price_minor?: number }>;
};

function normalizeTotalsFromCart(cart: Record<string, unknown> | null, shippingPrice?: number) {
  const subtotal =
    typeof cart?.subtotal === "number"
      ? cart.subtotal
      : typeof cart?.total === "number"
        ? cart.total
        : 0;
  
  // Use explicit shipping price if provided (optimistic UI), otherwise fallback to cart's shipping_total or 0
  const shipping = typeof shippingPrice === "number" 
      ? shippingPrice 
      : (typeof cart?.shipping_total === "number" ? cart.shipping_total : 0);

  return { subtotal, shipping, total: subtotal + shipping };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as SummaryBody;
    const cartId = body.cartId || body.guestCartId || undefined;
    
    // Try to read cart totals from Medusa Store API
    const cartRes = await readStoreCart(cartId);
    const cart = cartRes?.cart || null;
    const totals = normalizeTotalsFromCart(cart, body.shippingPrice);

    // If buy-now override with explicit prices exists, adjust subtotal
    if (Array.isArray(body.itemsOverride) && body.itemsOverride.length) {
      const overrideSubtotal = body.itemsOverride.reduce((sum, item) => {
        const price = typeof item.price_minor === "number" ? item.price_minor : 0;
        const qty = Math.max(1, Number(item.quantity) || 1);
        return sum + price * qty;
      }, 0);
      totals.subtotal = overrideSubtotal;
      totals.total = overrideSubtotal + totals.shipping;
    }

    return NextResponse.json({
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      total: totals.total,
    });
  } catch (err) {
    console.error("order-summary POST failed", err);
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}

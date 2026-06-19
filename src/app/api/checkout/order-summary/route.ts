import { NextResponse } from "next/server";
import { readStoreCart } from "@/lib/medusa-admin";
import { loadCheckoutOrder } from "@/lib/checkout-order";
import { calculateStatewiseShipping } from "@/lib/shipping-rules";
import {
  enrichOrderWithSummaryTotals,
  normalizeOrderForCustomer,
  type OrderDisplayTotals,
} from "@/lib/order-display-totals";

export const dynamic = "force-dynamic";

type SummaryBody = {
  mode?: "buy_now" | "cart";
  cartId?: string | null;
  guestCartId?: string | null;
  shippingState?: string;
  itemsOverride?: Array<{ variant_id: string; quantity: number; price_minor?: number }>;
};

function resolvePaidTotalMinor(
  metadata: Record<string, unknown>,
  displayTotals: OrderDisplayTotals
): number | undefined {
  if (typeof metadata.medusa_total_minor === "number" && metadata.medusa_total_minor > 0) {
    return Math.round(metadata.medusa_total_minor);
  }
  if (typeof metadata.razorpay_amount_minor === "number" && metadata.razorpay_amount_minor > 0) {
    return Math.round(metadata.razorpay_amount_minor);
  }
  if (displayTotals.grandTotal > 0) {
    return Math.round(displayTotals.grandTotal * 100);
  }
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") || url.searchParams.get("id");
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const loaded = await loadCheckoutOrder(orderId);
  const rawOrder = loaded?.order || null;
  if (!rawOrder) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const enriched = await enrichOrderWithSummaryTotals(rawOrder as Record<string, unknown>);
  const order = normalizeOrderForCustomer(enriched);
  const metadata = (order.metadata || {}) as Record<string, unknown>;
  const displayTotals = (order.display_totals || {}) as OrderDisplayTotals;

  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string" ? metadata.razorpay_payment_status : undefined;
  const payment_status =
    razorpayStatus === "captured" ? "paid" : (order.payment_status as string | undefined);

  const paid_total = resolvePaidTotalMinor(metadata, displayTotals);

  return NextResponse.json({
    order: {
      id: order.id,
      display_id: order.display_id,
      status: order.status,
      payment_status,
      fulfillment_status: order.fulfillment_status,
      is_draft_order: loaded?.isDraft ?? order.is_draft_order,
      email: order.email,
      currency_code: order.currency_code,
      total: displayTotals.grandTotal || order.total,
      paid_total,
      subtotal: displayTotals.itemsSubtotal || order.subtotal,
      tax_total: 0,
      shipping_total: displayTotals.shipping || order.shipping_total,
      display_totals: displayTotals,
      items: order.items,
      shipping_address: order.shipping_address,
      billing_address: order.billing_address,
      metadata,
    },
  });
}

function normalizeSubtotalFromCart(cart: Record<string, unknown> | null) {
  if (Array.isArray(cart?.items)) {
    const fromItems = cart.items.reduce((sum, item) => {
      const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const price = typeof record.unit_price === "number" ? record.unit_price : 0;
      const qty = Math.max(1, Number(record.quantity) || 1);
      return sum + price * qty;
    }, 0);
    if (fromItems > 0) return fromItems;
  }
  const subtotal =
    typeof cart?.subtotal === "number"
      ? cart.subtotal
      : typeof cart?.total === "number"
        ? cart.total
        : 0;
  return subtotal;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as SummaryBody;
    const cartId = body.cartId || body.guestCartId || undefined;

    const cartRes = await readStoreCart(cartId);
    const cart = cartRes?.cart || null;
    const subtotal = normalizeSubtotalFromCart(cart);
    const totals = {
      subtotal,
      shipping: calculateStatewiseShipping(subtotal, body.shippingState),
      total: 0,
    };
    totals.total = totals.subtotal + totals.shipping;

    if (Array.isArray(body.itemsOverride) && body.itemsOverride.length) {
      const overrideSubtotal = body.itemsOverride.reduce((sum, item) => {
        const price = typeof item.price_minor === "number" ? item.price_minor : 0;
        const qty = Math.max(1, Number(item.quantity) || 1);
        return sum + price * qty;
      }, 0);
      totals.subtotal = overrideSubtotal;
      totals.shipping = calculateStatewiseShipping(overrideSubtotal, body.shippingState);
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

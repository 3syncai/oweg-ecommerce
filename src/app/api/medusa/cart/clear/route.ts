import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkoutOrderAccessError } from "@/lib/checkout-order-access";
import { loadCheckoutOrder } from "@/lib/checkout-order";
import { completedCheckoutCartMatches } from "@/lib/completed-checkout-cart";

export const dynamic = "force-dynamic";

/** Detach only the unchanged cart belonging to this confirmed checkout. Never delete cart items. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
  const access = await checkoutOrderAccessError(req, orderId);
  if (access) return access;
  const loaded = await loadCheckoutOrder(orderId);
  const order = loaded?.order;
  const metadata = order?.metadata || {};
  if (loaded?.isDraft || !order || !(metadata.razorpay_payment_status === "captured" || metadata.cod_status === "confirmed")) {
    return NextResponse.json({ error: "confirmed_checkout_required" }, { status: 409 });
  }
  const currentCartId = (await cookies()).get("cart_id")?.value || req.headers.get("x-guest-cart-id");
  const purchasedCartId = typeof metadata.cart_id === "string" ? metadata.cart_id : "";
  if (metadata.mode === "buy_now" || !purchasedCartId || currentCartId !== purchasedCartId) {
    return NextResponse.json({ cleared: false, reason: "different_or_missing_checkout_cart" });
  }
  const base = (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_KEY || process.env.MEDUSA_PUBLISHABLE_API_KEY || "";
  const response = await fetch(`${base}/store/carts/${encodeURIComponent(purchasedCartId)}`, { cache: "no-store", headers: { "x-publishable-api-key": key } });
  if (!response.ok) return NextResponse.json({ cleared: false, reason: "checkout_cart_unavailable" });
  const payload = await response.json();
  if (!completedCheckoutCartMatches(order.items, payload.cart?.items)) {
    return NextResponse.json({ cleared: false, reason: "cart_changed_since_checkout" });
  }
  const result = NextResponse.json({ cleared: true, clearedCartId: purchasedCartId });
  result.cookies.set("cart_id", "", { path: "/", maxAge: 0, sameSite: "lax" });
  return result;
}

import { NextResponse } from "next/server";
import { medusaStoreFetch } from "@/lib/medusa-auth";
import { loadCheckoutOrder } from "@/lib/checkout-order";

/** Customer session ownership, separate from authenticated gateway callback verification. */
export async function loadAuthorizedCheckoutOrder(req: Request, orderId: string) {
  const denied = (error: string, status: number) => ({
    error: NextResponse.json({ error }, { status }), loaded: null,
  });
  const cookie = req.headers.get("cookie");
  if (!cookie) return denied("authentication_required", 401);
  try {
    const response = await medusaStoreFetch("/store/customers/me", { forwardedCookie: cookie });
    if (!response.ok) return denied("authentication_required", response.status >= 500 ? 503 : 401);
    const data = await response.json();
    const customer = data.customer || data;
    if (!customer?.id) return denied("authentication_required", 401);
    const loaded = await loadCheckoutOrder(orderId);
    if (!loaded) return denied("order_not_found", 404);
    const owner = loaded.order.customer_id;
    const owned = owner ? owner === customer.id :
      typeof loaded.order.email === "string" && typeof customer.email === "string" && loaded.order.email.toLowerCase() === customer.email.toLowerCase();
    return owned ? { error: null, loaded } : denied("order_access_denied", 403);
  } catch { return denied("checkout_temporarily_unavailable", 503); }
}

export async function checkoutOrderAccessError(req: Request, orderId: string): Promise<NextResponse | null> {
  return (await loadAuthorizedCheckoutOrder(req, orderId)).error;
}

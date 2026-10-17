import { NextResponse } from "next/server";
import { medusaStoreFetch } from "@/lib/medusa-auth";
import { loadCheckoutOrder } from "@/lib/checkout-order";

/** Customer session ownership, separate from authenticated gateway callback verification. */
export async function checkoutOrderAccessError(req: Request, orderId: string): Promise<NextResponse | null> {
  const cookie = req.headers.get("cookie");
  if (!cookie) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  try {
    const response = await medusaStoreFetch("/store/customers/me", { forwardedCookie: cookie });
    if (!response.ok) return NextResponse.json({ error: "authentication_required" }, { status: response.status >= 500 ? 503 : 401 });
    const data = await response.json();
    const customer = data.customer || data;
    if (!customer?.id) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
    const loaded = await loadCheckoutOrder(orderId);
    if (!loaded) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    const owner = loaded.order.customer_id;
    const owned = owner ? owner === customer.id :
      typeof loaded.order.email === "string" && typeof customer.email === "string" && loaded.order.email.toLowerCase() === customer.email.toLowerCase();
    return owned ? null : NextResponse.json({ error: "order_access_denied" }, { status: 403 });
  } catch { return NextResponse.json({ error: "checkout_temporarily_unavailable" }, { status: 503 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { medusaStoreFetch } from "@/lib/medusa-auth";

export async function GET(req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
  const awaitedParams = await ctx.params;
  const orderId = awaitedParams?.id;
  if (!orderId) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  const forwardedCookie = req.headers.get("cookie") || undefined;
  if (!forwardedCookie) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    // Validate session and fetch customer profile
    const meRes = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      forwardedCookie,
      headers: { Cookie: forwardedCookie },
    });
    if (!meRes.ok) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const me = (await meRes.json()) as { customer?: { id?: string } };
    const customerId = me?.customer?.id;

    const res = await medusaStoreFetch(`/store/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      forwardedCookie,
      headers: {
        Cookie: forwardedCookie,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Unable to load order" }, { status: res.status });
    }
    const data = await res.json();
    const order = (data as { order?: Record<string, unknown> }).order || data;
    const orderRecord = order as { customer_id?: string; customer?: { id?: string } };
    const orderCustomerId = orderRecord?.customer_id || orderRecord?.customer?.id;

    if (customerId && orderCustomerId && customerId !== orderCustomerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ order });
  } catch {
    return NextResponse.json({ error: "Unexpected error loading order" }, { status: 500 });
  }
}

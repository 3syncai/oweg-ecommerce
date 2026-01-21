import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/medusa-admin";
import { medusaStoreFetch } from "@/lib/medusa-auth";

export async function POST(req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
  const awaitedParams = await ctx.params;
  const orderId = awaitedParams?.id;
  if (!orderId) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  const forwardedCookie = req.headers.get("cookie") || undefined;
  if (!forwardedCookie) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const cancelStore = async () => {
      return medusaStoreFetch(`/store/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        forwardedCookie,
        headers: { Cookie: forwardedCookie },
      });
    };

    let res = await cancelStore();
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    const text = await res.text();
    if (!text.includes("fulfillments must be canceled")) {
      return NextResponse.json({ error: text || "Unable to cancel order" }, { status: res.status });
    }

    const adminOrderRes = await adminFetch<{ order?: { fulfillments?: Array<Record<string, unknown>> } }>(
      `/admin/orders/${encodeURIComponent(orderId)}`
    );
    if (!adminOrderRes.ok || !adminOrderRes.data?.order) {
      return NextResponse.json({ error: "Unable to load order for cancellation" }, { status: 500 });
    }

    const fulfillments = adminOrderRes.data.order.fulfillments || [];
    for (const fulfillment of fulfillments) {
      const fulfillmentId = fulfillment?.id as string | undefined;
      const canceledAt = fulfillment?.canceled_at as string | undefined;
      const deliveredAt = fulfillment?.delivered_at as string | undefined;
      if (!fulfillmentId || canceledAt || deliveredAt) {
        continue;
      }
      await adminFetch(`/admin/orders/${encodeURIComponent(orderId)}/fulfillments/${encodeURIComponent(fulfillmentId)}/cancel`, {
        method: "POST",
      });
    }

    res = await cancelStore();
    if (!res.ok) {
      const retryText = await res.text();
      return NextResponse.json({ error: retryText || "Unable to cancel order" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error cancelling order" }, { status: 500 });
  }
}

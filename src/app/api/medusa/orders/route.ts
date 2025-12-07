import { NextRequest, NextResponse } from "next/server";
import { MEDUSA_CONFIG } from "@/lib/medusa-config";
import { medusaStoreFetch } from "@/lib/medusa-auth";

export async function GET(req: NextRequest) {
  try {
    const cookie = req.headers.get("cookie") || undefined;
    if (!cookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate session before proxying
    const meRes = await medusaStoreFetch("/store/customers/me", {
      headers: { Cookie: cookie },
      forwardedCookie: cookie,
    });
    if (!meRes.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit") || 20);
    const offsetParam = Number(url.searchParams.get("offset") || 0);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const target = new URL(`${MEDUSA_CONFIG.BASE_URL.replace(/\/$/, "")}/store/orders`);
    target.searchParams.set("limit", String(limit));
    target.searchParams.set("offset", String(offset));

    const res = await medusaStoreFetch(target.toString(), {
      method: "GET",
      forwardedCookie: cookie,
      headers: {
        ...(MEDUSA_CONFIG.PUBLISHABLE_KEY ? { "x-publishable-api-key": MEDUSA_CONFIG.PUBLISHABLE_KEY } : {}),
        ...(MEDUSA_CONFIG.SALES_CHANNEL_ID ? { "x-sales-channel-id": MEDUSA_CONFIG.SALES_CHANNEL_ID } : {}),
        Cookie: cookie,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Unable to load orders" }, { status: res.status });
    }
    const data = await res.json();
    const orders = (data as { orders?: unknown[] }).orders || data;
    const count = (data as { count?: number }).count ?? (Array.isArray(orders) ? orders.length : 0);
    const rawLimit = (data as { limit?: number }).limit ?? limit;
    const rawOffset = (data as { offset?: number }).offset ?? offset;
    return NextResponse.json({ orders, count, limit: rawLimit, offset: rawOffset });
  } catch {
    return NextResponse.json({ error: "Unexpected error loading orders" }, { status: 500 });
  }
}

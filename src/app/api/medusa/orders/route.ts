import { NextRequest, NextResponse } from "next/server";
import { MEDUSA_CONFIG } from "@/lib/medusa-config";
import { medusaStoreFetch } from "@/lib/medusa-auth";
import { isCustomerVisibleOrder } from "@/lib/checkout-order";
import {
  enrichOrdersWithSummaryTotals,
  normalizeOrderForCustomer,
} from "@/lib/order-display-totals";
function toTimestamp(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortLatestFirst<T>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const aCreated = toTimestamp((a as { created_at?: unknown })?.created_at);
    const bCreated = toTimestamp((b as { created_at?: unknown })?.created_at);
    return bCreated - aCreated;
  });
}

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
    const meData = await meRes.json().catch(() => ({}));
    const customerId =
      (meData as { customer?: { id?: string } }).customer?.id ||
      (meData as { id?: string }).id ||
      undefined;

    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit") || 20);
    const offsetParam = Number(url.searchParams.get("offset") || 0);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const baseTarget = new URL(`${MEDUSA_CONFIG.BASE_URL.replace(/\/$/, "")}/store/orders`);
    baseTarget.searchParams.set("limit", String(limit));
    baseTarget.searchParams.set("offset", String(offset));
    // Ensure metadata is available for payment method filters (e.g. COD).
    baseTarget.searchParams.set("fields", "+metadata,+items");

    const fetchWithOrder = async (orderValue?: string, directionValue?: string) => {
      const target = new URL(baseTarget.toString());
      if (orderValue) target.searchParams.set("order", orderValue);
      if (directionValue) target.searchParams.set("direction", directionValue);
      return medusaStoreFetch(target.toString(), {
        method: "GET",
        forwardedCookie: cookie,
        headers: {
          ...(MEDUSA_CONFIG.PUBLISHABLE_KEY ? { "x-publishable-api-key": MEDUSA_CONFIG.PUBLISHABLE_KEY } : {}),
          ...(MEDUSA_CONFIG.SALES_CHANNEL_ID ? { "x-sales-channel-id": MEDUSA_CONFIG.SALES_CHANNEL_ID } : {}),
          Cookie: cookie,
        },
      });
    };

    let res = await fetchWithOrder("-created_at");
    if (res.status === 400) {
      res = await fetchWithOrder("created_at", "desc");
    }
    if (res.status === 400) {
      res = await fetchWithOrder();
    }

    if (!res.ok) {
      return NextResponse.json({ error: "Unable to load orders" }, { status: res.status });
    }

    const data = await res.json();
    const rawOrders = (data as { orders?: unknown[] }).orders || data;
    const orders = (Array.isArray(rawOrders) ? rawOrders : []).filter((order) =>
      isCustomerVisibleOrder(order as Record<string, unknown>)
    );
    const enrichedOrders = await enrichOrdersWithSummaryTotals(
      orders as Record<string, unknown>[]
    );
    const normalizedOrders = enrichedOrders.map((order) => normalizeOrderForCustomer(order));
    const count = normalizedOrders.length;
    const rawLimit = (data as { limit?: number }).limit ?? limit;
    const rawOffset = (data as { offset?: number }).offset ?? offset;

    return NextResponse.json({ orders: sortLatestFirst(normalizedOrders), count, limit: rawLimit, offset: rawOffset });
  } catch {
    return NextResponse.json({ error: "Unexpected error loading orders" }, { status: 500 });
  }
}

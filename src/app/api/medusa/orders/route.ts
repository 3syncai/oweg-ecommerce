import { NextRequest, NextResponse } from "next/server";
import { MEDUSA_CONFIG } from "@/lib/medusa-config";
import { medusaStoreFetch } from "@/lib/medusa-auth";
import { adminFetch } from "@/lib/medusa-admin";

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
    baseTarget.searchParams.set("fields", "+metadata");

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
    const orders = Array.isArray(rawOrders) ? rawOrders : [];
    const count = (data as { count?: number }).count ?? orders.length;
    const rawLimit = (data as { limit?: number }).limit ?? limit;
    const rawOffset = (data as { offset?: number }).offset ?? offset;

    let draftOrders: unknown[] = [];
    if (customerId) {
      const params = new URLSearchParams();
      params.set("customer_id", customerId);
      params.set("fields", "+metadata");
      params.set("limit", "200");
      const draftRes = await adminFetch(`/admin/draft-orders?${params.toString()}`);
      if (draftRes.ok && draftRes.data) {
        const draftData = draftRes.data as {
          draft_orders?: unknown[];
          draftOrders?: unknown[];
          data?: unknown[];
        };
        const rawDrafts = draftData.draft_orders || draftData.draftOrders || draftData.data || [];
        if (Array.isArray(rawDrafts)) {
          draftOrders = rawDrafts;
        }
      }
    }

    if (draftOrders.length) {
      const merged = new Map<string, unknown>();
      orders.forEach((order) => {
        const id = (order as { id?: string | number })?.id;
        if (id !== undefined && id !== null) merged.set(String(id), order);
      });
      draftOrders.forEach((order) => {
        const id = (order as { id?: string | number })?.id;
        if (id !== undefined && id !== null) merged.set(String(id), order);
      });
      const combined = Array.from(merged.values());
      return NextResponse.json({ orders: combined, count: combined.length, limit: rawLimit, offset: rawOffset });
    }

    return NextResponse.json({ orders, count, limit: rawLimit, offset: rawOffset });
  } catch {
    return NextResponse.json({ error: "Unexpected error loading orders" }, { status: 500 });
  }
}

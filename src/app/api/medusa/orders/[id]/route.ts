import { NextRequest, NextResponse } from "next/server";
import { adminFetch, getOrderById } from "@/lib/medusa-admin";
import { medusaStoreFetch } from "@/lib/medusa-auth";
import {
  enrichOrderWithSummaryTotals,
  normalizeOrderForCustomer,
} from "@/lib/order-display-totals";

type MedusaOrder = Record<string, unknown>;

function extractOrder(data: unknown): MedusaOrder | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const direct = root.order;
  if (direct && typeof direct === "object") return direct as MedusaOrder;
  const draft = root.draft_order;
  if (draft && typeof draft === "object") return draft as MedusaOrder;
  const nested = root.data;
  if (nested && typeof nested === "object") {
    const nestedOrder = (nested as Record<string, unknown>).order;
    if (nestedOrder && typeof nestedOrder === "object") return nestedOrder as MedusaOrder;
    const nestedDraft = (nested as Record<string, unknown>).draft_order;
    if (nestedDraft && typeof nestedDraft === "object") return nestedDraft as MedusaOrder;
  }
  return root as MedusaOrder;
}

function orderEmail(order: MedusaOrder): string | undefined {
  if (typeof order.email === "string" && order.email) return order.email;
  const shipping = order.shipping_address;
  if (shipping && typeof shipping === "object") {
    const email = (shipping as Record<string, unknown>).email;
    if (typeof email === "string" && email) return email;
  }
  return undefined;
}

function orderCustomerId(order: MedusaOrder): string | undefined {
  if (typeof order.customer_id === "string" && order.customer_id) return order.customer_id;
  const customer = order.customer;
  if (customer && typeof customer === "object") {
    const id = (customer as Record<string, unknown>).id;
    if (typeof id === "string" && id) return id;
  }
  return undefined;
}

function ownsOrder(order: MedusaOrder, customerId?: string, customerEmail?: string): boolean {
  const orderCustId = orderCustomerId(order);
  if (customerId && orderCustId && customerId === orderCustId) return true;

  const email = orderEmail(order);
  if (customerEmail && email && customerEmail.toLowerCase() === email.toLowerCase()) {
    return true;
  }

  return false;
}

async function loadOrderFromAdmin(orderId: string): Promise<MedusaOrder | null> {
  const orderRes = await getOrderById(orderId);
  if (orderRes.ok && orderRes.data) {
    const order = extractOrder(orderRes.data);
    if (order?.id) return order;
  }

  const draftRes = await adminFetch(`/admin/draft-orders/${encodeURIComponent(orderId)}`);
  if (draftRes.ok && draftRes.data) {
    const draft = extractOrder(draftRes.data);
    if (draft?.id) return draft;
  }

  return null;
}

export async function GET(req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
  const awaitedParams = await ctx.params;
  const orderId = awaitedParams?.id;
  if (!orderId) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  const forwardedCookie = req.headers.get("cookie") || undefined;
  if (!forwardedCookie) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const meRes = await medusaStoreFetch("/store/customers/me", {
      method: "GET",
      forwardedCookie,
      headers: { Cookie: forwardedCookie },
    });
    if (!meRes.ok) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const me = (await meRes.json()) as { customer?: { id?: string; email?: string } };
    const customerId = me?.customer?.id;
    const customerEmail = me?.customer?.email;

    let order: MedusaOrder | null = null;

    const storeRes = await medusaStoreFetch(`/store/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      forwardedCookie,
      headers: { Cookie: forwardedCookie },
    });

    if (storeRes.ok) {
      const data = await storeRes.json();
      order = ((data as { order?: MedusaOrder }).order || data) as MedusaOrder;
    } else {
      order = await loadOrderFromAdmin(orderId);
      if (!order) {
        return NextResponse.json({ error: "Unable to load order" }, { status: storeRes.status === 404 ? 404 : 502 });
      }
    }

    if (!ownsOrder(order, customerId, customerEmail)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adminRes = await getOrderById(orderId);
    if (adminRes.ok && adminRes.data) {
      const adminOrder = extractOrder(adminRes.data);
      if (adminOrder?.summary) {
        order = { ...order, summary: adminOrder.summary };
      }
    }

    order = await enrichOrderWithSummaryTotals(order);

    return NextResponse.json({ order: normalizeOrderForCustomer(order) });
  } catch {
    return NextResponse.json({ error: "Unexpected error loading order" }, { status: 500 });
  }
}

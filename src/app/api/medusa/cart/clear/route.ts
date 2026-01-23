import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const CART_COOKIE = "cart_id";
const GUEST_CART_HEADER = "x-guest-cart-id";

const REGION_ID =
  process.env.NEXT_PUBLIC_MEDUSA_REGION_ID || process.env.MEDUSA_REGION_ID;

async function backend(path: string, init?: RequestInit) {
  const base = (
    process.env.MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    "http://localhost:9000"
  ).replace(/\/$/, "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const pk =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_API_KEY;
  const sc =
    process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID ||
    process.env.MEDUSA_SALES_CHANNEL_ID;
  if (pk) headers["x-publishable-api-key"] = pk;
  if (sc) headers["x-sales-channel-id"] = sc;
  if (REGION_ID) headers["x-region-id"] = REGION_ID;
  return fetch(`${base}${path}`, {
    cache: "no-store",
    ...init,
    headers: { ...headers, ...(init?.headers as HeadersInit) },
  });
}

export const dynamic = "force-dynamic";

function extractItems(payload: unknown): Array<{ id?: string }> {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const cart = (root.cart && typeof root.cart === "object" ? root.cart : root) as Record<string, unknown>;
  const items = (cart.items as unknown) ?? (cart.line_items as unknown);
  if (!Array.isArray(items)) return [];
  return items as Array<{ id?: string }>;
}

async function resolveCartId(req: NextRequest): Promise<string | null> {
  const c = await cookies();
  const cookieCartId = c.get(CART_COOKIE)?.value;
  if (cookieCartId) return cookieCartId;
  const guestCartId = req.headers.get(GUEST_CART_HEADER);
  return guestCartId || null;
}

export async function POST(req: NextRequest) {
  const cartId = await resolveCartId(req);
  if (!cartId) {
    return NextResponse.json({ cleared: false, reason: "cart_id_not_found" });
  }

  const cartRes = await backend(`/store/carts/${encodeURIComponent(cartId)}`);
  if (!cartRes.ok) {
    return NextResponse.json({
      cleared: false,
      reason: "cart_not_found",
      status: cartRes.status,
    });
  }
  const cartPayload = await cartRes.json();
  const items = extractItems(cartPayload);

  if (!items.length) {
    return NextResponse.json({ cleared: true, cart: cartPayload.cart || cartPayload });
  }

  const deletions = await Promise.allSettled(
    items.map((item) => {
      if (!item?.id) return Promise.resolve({ ok: true, skipped: true });
      return backend(
        `/store/carts/${encodeURIComponent(cartId)}/line-items/${encodeURIComponent(String(item.id))}`,
        { method: "DELETE" }
      );
    })
  );

  const failed: Array<{ id?: string; status?: number }> = [];
  deletions.forEach((result, index) => {
    if (result.status === "fulfilled") {
      const res = result.value as Response;
      if (!res.ok) {
        failed.push({ id: items[index]?.id, status: res.status });
      }
    } else {
      failed.push({ id: items[index]?.id });
    }
  });

  const refreshed = await backend(`/store/carts/${encodeURIComponent(cartId)}`);
  const refreshedPayload = refreshed.ok ? await refreshed.json() : null;

  return NextResponse.json({
    cleared: failed.length === 0,
    failed,
    cart: refreshedPayload?.cart || refreshedPayload || null,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const CART_COOKIE = "cart_id";
const GUEST_CART_HEADER = "x-guest-cart-id";

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
  return fetch(`${base}${path}`, {
    cache: "no-store",
    ...init,
    headers: { ...headers, ...(init?.headers as HeadersInit) },
  });
}

type ResolveCartResult = {
  cartId: string;
  shouldSetCookie: boolean;
};

async function resolveCartId(req: NextRequest): Promise<ResolveCartResult | null> {
  const c = await cookies();
  const cookieCartId = c.get(CART_COOKIE)?.value;
  if (cookieCartId) {
    return { cartId: cookieCartId, shouldSetCookie: false };
  }
  const guestCartId = req.headers.get(GUEST_CART_HEADER) || undefined;
  if (guestCartId) {
    return { cartId: guestCartId, shouldSetCookie: false };
  }
  return null;
}

type RouteParams = {
  lineId: string;
};

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<RouteParams> | RouteParams;
};

const getParams = async (ctx: RouteContext): Promise<RouteParams> => {
  const value = await ctx.params;
  return value;
};

async function readErrorPayload(res: Response) {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}

const deriveErrorMessage = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const msg = record.error || record.message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (typeof payload === "string" && payload.trim()) return payload;
  return fallback;
};

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { lineId } = await getParams(ctx);
  if (!lineId) {
    return NextResponse.json({ error: "lineId required" }, { status: 400 });
  }
  try {
    const body = await req.json();
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      return NextResponse.json({ error: "quantity must be >= 1" }, { status: 400 });
    }
    const cartResult = await resolveCartId(req);
    if (!cartResult?.cartId) {
      return NextResponse.json({ error: "cart_id not found" }, { status: 400 });
    }
    const { cartId, shouldSetCookie } = cartResult;
    const res = await backend(
      `/store/carts/${encodeURIComponent(cartId)}/line-items/${encodeURIComponent(lineId)}`,
      {
        method: "POST",
        body: JSON.stringify({ quantity }),
      }
    );
    if (!res.ok) {
      const payload = await readErrorPayload(res);
      const message = deriveErrorMessage(payload, "Unable to update cart item");
      return NextResponse.json({ error: message, details: payload }, { status: res.status });
    }
    const data = await res.json();
    const response = NextResponse.json(data);
    if (shouldSetCookie) {
      response.cookies.set(CART_COOKIE, cartId, { httpOnly: false, sameSite: "lax", path: "/" });
    }
    return response;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { lineId } = await getParams(ctx);
  if (!lineId) {
    return NextResponse.json({ error: "lineId required" }, { status: 400 });
  }
  try {
    const cartResult = await resolveCartId(req);
    if (!cartResult?.cartId) {
      return NextResponse.json({ error: "cart_id not found" }, { status: 400 });
    }
    const { cartId, shouldSetCookie } = cartResult;
    const res = await backend(
      `/store/carts/${encodeURIComponent(cartId)}/line-items/${encodeURIComponent(lineId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const payload = await readErrorPayload(res);
      const message = deriveErrorMessage(payload, "Unable to remove cart item");
      return NextResponse.json({ error: message, details: payload }, { status: res.status });
    }
    const data = await res.json();
    const response = NextResponse.json(data);
    if (shouldSetCookie) {
      response.cookies.set(CART_COOKIE, cartId, { httpOnly: false, sameSite: "lax", path: "/" });
    }
    return response;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

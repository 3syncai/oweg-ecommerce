import { NextRequest, NextResponse } from "next/server";

const BASE_URL =
  process.env.MEDUSA_BACKEND_URL ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9000";

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  process.env.MEDUSA_PUBLISHABLE_KEY ||
  process.env.MEDUSA_PUBLISHABLE_API_KEY ||
  "";

const SALES_CHANNEL_ID =
  process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID ||
  process.env.MEDUSA_SALES_CHANNEL_ID ||
  "";

export async function GET(req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
  const awaitedParams = await ctx.params;
  const orderId = awaitedParams?.id;
  if (!orderId) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  try {
    const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/store/orders/${encodeURIComponent(orderId)}`, {
      cache: "no-store",
      headers: {
        ...(PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {}),
        ...(SALES_CHANNEL_ID ? { "x-sales-channel-id": SALES_CHANNEL_ID } : {}),
        Cookie: req.headers.get("cookie") || "",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Unable to load order" }, { status: res.status });
    }
    const data = await res.json();
    const order = (data as { order?: unknown }).order || data;
    return NextResponse.json({ order });
  } catch {
    return NextResponse.json({ error: "Unexpected error loading order" }, { status: 500 });
  }
}

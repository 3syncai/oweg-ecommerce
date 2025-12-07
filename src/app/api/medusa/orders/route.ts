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

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/store/orders`, {
      cache: "no-store",
      headers: {
        ...(PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {}),
        ...(SALES_CHANNEL_ID ? { "x-sales-channel-id": SALES_CHANNEL_ID } : {}),
        Cookie: req.headers.get("cookie") || "",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Unable to load orders" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ orders: (data as { orders?: unknown[] }).orders || data });
  } catch {
    return NextResponse.json({ error: "Unexpected error loading orders" }, { status: 500 });
  }
}

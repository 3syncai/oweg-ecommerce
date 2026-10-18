import { NextRequest, NextResponse } from "next/server";
import { medusaStoreFetch } from "@/lib/medusa-auth";

type Context = { params: { id: string } | Promise<{ id: string }> };

async function forward(req: NextRequest, ctx: Context, method: "GET" | "POST") {
  const { id } = await ctx.params;
  const cookie = req.headers.get("cookie") || "";
  if (!id || !cookie) return NextResponse.json({ message: "Sign in to view this order" }, { status: 401 });
  try {
    const body = method === "POST" ? await req.text() : undefined;
    const response = await medusaStoreFetch(
      `/store/orders/${encodeURIComponent(id)}/replacement-requests`,
      {
        method,
        forwardedCookie: cookie,
        headers: { Cookie: cookie, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body } : {}),
      }
    );
    const result = await response.json().catch(() => ({ message: "Could not load replacement request" }));
    return NextResponse.json(result, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Replacement request service is unavailable" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: Context) {
  return forward(req, ctx, "GET");
}

export async function POST(req: NextRequest, ctx: Context) {
  return forward(req, ctx, "POST");
}

import { NextRequest, NextResponse } from "next/server";
import { medusaStoreFetch } from "@/lib/medusa-auth";

export async function POST(req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
  const awaitedParams = await ctx.params;
  const addressId = awaitedParams?.id;
  if (!addressId) return NextResponse.json({ error: "Address id required" }, { status: 400 });

  const forwardedCookie = req.headers.get("cookie") || undefined;
  if (!forwardedCookie) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const res = await medusaStoreFetch(`/store/customers/me/addresses/${encodeURIComponent(addressId)}`, {
      method: "POST",
      forwardedCookie,
      headers: { Cookie: forwardedCookie },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || "Unable to update address" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error updating address" }, { status: 500 });
  }
}

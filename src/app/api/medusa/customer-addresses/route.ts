import { NextRequest, NextResponse } from "next/server";
import { medusaStoreFetch } from "@/lib/medusa-auth";

export async function GET(req: NextRequest) {
  const forwardedCookie = req.headers.get("cookie") || undefined;
  if (!forwardedCookie) {
    return NextResponse.json({ addresses: [] }, { status: 200 });
  }

  try {
    const res = await medusaStoreFetch("/store/customers/me/addresses", {
      method: "GET",
      forwardedCookie,
      headers: { Cookie: forwardedCookie },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || "Unable to load addresses" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error loading addresses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
    const res = await medusaStoreFetch("/store/customers/me/addresses", {
      method: "POST",
      forwardedCookie,
      headers: { Cookie: forwardedCookie },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || "Unable to save address" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error saving address" }, { status: 500 });
  }
}

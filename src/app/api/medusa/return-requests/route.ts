import { NextRequest, NextResponse } from "next/server";
import { medusaStoreFetch } from "@/lib/medusa-auth";

async function ensureCustomer(forwardedCookie?: string) {
  if (!forwardedCookie) return { ok: false, status: 401 };
  const meRes = await medusaStoreFetch("/store/customers/me", {
    method: "GET",
    forwardedCookie,
  });
  if (!meRes.ok) {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const forwardedCookie = req.headers.get("cookie") || undefined;
  const auth = await ensureCustomer(forwardedCookie);
  if (!auth.ok) {
    return NextResponse.json({ error: "Authentication required" }, { status: auth.status });
  }

  try {
    const res = await medusaStoreFetch("/store/return-requests", {
      method: "GET",
      forwardedCookie,
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Unable to load return requests" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error loading return requests" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const forwardedCookie = req.headers.get("cookie") || undefined;
  const auth = await ensureCustomer(forwardedCookie);
  if (!auth.ok) {
    return NextResponse.json({ error: "Authentication required" }, { status: auth.status });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const res = await medusaStoreFetch("/store/return-requests", {
      method: "POST",
      forwardedCookie,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const error = await res.text();
      return NextResponse.json({ error: error || "Unable to create return request" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error creating return request" }, { status: 500 });
  }
}

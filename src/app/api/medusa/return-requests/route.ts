import { NextRequest, NextResponse } from "next/server";
import { medusaStoreFetch } from "@/lib/medusa-auth";
import { returnRequestError } from "@/lib/return-request-error";

async function ensureCustomer(forwardedCookie?: string) {
  if (!forwardedCookie) return { ok: false, status: 401 };
  try {
  const meRes = await medusaStoreFetch("/store/customers/me", {
    method: "GET",
    forwardedCookie,
  });
  if (!meRes.ok) {
    return { ok: false, status: meRes.status >= 500 ? 503 : 401 };
  }
  return { ok: true };
  } catch { return { ok: false, status: 503 }; }
}

export async function GET(req: NextRequest) {
  const forwardedCookie = req.headers.get("cookie") || undefined;
  const auth = await ensureCustomer(forwardedCookie);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Please sign in again." : "Returns are temporarily unavailable. Please try again shortly." }, { status: auth.status });
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
    return NextResponse.json({ error: auth.status === 401 ? "Please sign in again." : "Returns are temporarily unavailable. Please try again shortly." }, { status: auth.status });
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
      const payload = await res.json().catch(() => null);
      return NextResponse.json({ error: returnRequestError(res.status, payload) }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error creating return request" }, { status: 500 });
  }
}

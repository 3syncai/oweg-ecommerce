import { NextRequest, NextResponse } from "next/server";
import { extractErrorPayload, medusaStoreFetch } from "@/lib/medusa-auth";

function toErrorMessage(errorPayload: unknown, fallback: string) {
  if (typeof errorPayload === "string" && errorPayload) return errorPayload;
  if (typeof errorPayload === "object" && errorPayload) {
    const payload = errorPayload as Record<string, unknown>;
    if (typeof payload.error === "string" && payload.error) return payload.error;
    if (typeof payload.message === "string" && payload.message) return payload.message;
  }
  return fallback;
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
  const awaitedParams = await ctx.params;
  const addressId = awaitedParams?.id;
  if (!addressId) return NextResponse.json({ error: "Address id required" }, { status: 400 });

  const forwardedCookie = req.headers.get("cookie") || undefined;
  if (!forwardedCookie) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const res = await medusaStoreFetch(
      `/store/customers/me/addresses/${encodeURIComponent(addressId)}`,
      {
        method: "DELETE",
        forwardedCookie,
        headers: { Cookie: forwardedCookie },
      }
    );

    if (!res.ok) {
      const payload = await extractErrorPayload(res);
      const message = toErrorMessage(payload, "Unable to delete address");
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error deleting address" }, { status: 500 });
  }
}

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
      const payload = await extractErrorPayload(res);
      const message = toErrorMessage(payload, "Unable to update address");
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error updating address" }, { status: 500 });
  }
}

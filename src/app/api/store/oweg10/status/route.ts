import { NextRequest, NextResponse } from "next/server";
import { medusaStoreFetch } from "@/lib/medusa-auth";
import { getOweg10Status } from "@/lib/oweg10";

export const dynamic = "force-dynamic";

type StoreCustomer = {
  id?: string;
  metadata?: Record<string, unknown> | null;
};

async function getAuthenticatedCustomer(req: NextRequest) {
  const cookie = req.headers.get("cookie") || undefined;
  if (!cookie) return null;

  const res = await medusaStoreFetch("/store/customers/me", {
    method: "GET",
    forwardedCookie: cookie,
    headers: { cookie },
    skipContentType: true,
  });

  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return ((data as { customer?: StoreCustomer }).customer || data) as StoreCustomer;
}

export async function GET(req: NextRequest) {
  try {
    const customer = await getAuthenticatedCustomer(req);

    if (!customer?.id) {
      return NextResponse.json({
        isLoggedIn: false,
        consumed: false,
        pending: false,
        canApply: false,
        shouldShowBanner: true,
      });
    }

    const metadataConsumed = customer.metadata?.oweg10_consumed === true;
    const usage = metadataConsumed
      ? { consumed: true, pending: false, orderId: null, expiresAt: null }
      : await getOweg10Status(customer.id);

    return NextResponse.json({
      isLoggedIn: true,
      consumed: usage.consumed,
      pending: usage.pending,
      canApply: !usage.consumed && !usage.pending,
      shouldShowBanner: !usage.consumed,
      orderId: usage.orderId,
      expiresAt: usage.expiresAt,
    });
  } catch (error) {
    console.error("oweg10 status failed", error);
    return NextResponse.json(
      {
        isLoggedIn: false,
        consumed: false,
        pending: false,
        canApply: false,
        shouldShowBanner: true,
      },
      { status: 200 }
    );
  }
}

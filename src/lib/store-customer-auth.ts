import { NextRequest } from "next/server";
import { medusaStoreFetch } from "@/lib/medusa-auth";

export type AuthenticatedStoreCustomer = {
  id: string;
  metadata?: Record<string, unknown> | null;
};

export async function getAuthenticatedStoreCustomer(
  req: NextRequest
): Promise<AuthenticatedStoreCustomer | null> {
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
  const customer =
    ((data as { customer?: AuthenticatedStoreCustomer }).customer || data) as AuthenticatedStoreCustomer;

  return customer?.id ? customer : null;
}

export async function getAuthenticatedCustomerId(req: NextRequest): Promise<string | null> {
  const customer = await getAuthenticatedStoreCustomer(req);
  return customer?.id ?? null;
}

/**
 * Returns authenticated customer id, or rejects when x-customer-id header mismatches session.
 */
export async function resolveAuthenticatedCustomerId(
  req: NextRequest
): Promise<{ customerId: string | null; forbidden: boolean }> {
  const customerId = await getAuthenticatedCustomerId(req);
  if (!customerId) return { customerId: null, forbidden: false };

  const headerId = req.headers.get("x-customer-id")?.trim();
  if (headerId && headerId !== customerId) {
    return { customerId: null, forbidden: true };
  }

  return { customerId, forbidden: false };
}

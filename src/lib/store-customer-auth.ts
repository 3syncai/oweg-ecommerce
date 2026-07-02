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

export const INTERNAL_API_SECRET_HEADER = "x-internal-api-secret";

export function verifyInternalApiSecret(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret) return false;

  const headerSecret = req.headers.get(INTERNAL_API_SECRET_HEADER)?.trim();
  if (headerSecret && headerSecret === secret) return true;

  const authHeader = req.headers.get("authorization")?.trim();
  if (authHeader === `Bearer ${secret}`) return true;

  return false;
}

export function internalApiHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (secret) {
    headers[INTERNAL_API_SECRET_HEADER] = secret;
  }
  return headers;
}

export type WalletMutationAuthResult =
  | { ok: true; customerId: string | null; internal: true }
  | { ok: true; customerId: string; internal: false }
  | { ok: false; status: 401 | 403 };

/**
 * Wallet mutations accept either a logged-in store customer session or
 * server-to-server calls authenticated with INTERNAL_API_SECRET.
 */
export async function authorizeWalletMutation(
  req: NextRequest
): Promise<WalletMutationAuthResult> {
  if (verifyInternalApiSecret(req)) {
    return { ok: true, customerId: null, internal: true };
  }

  const { customerId, forbidden } = await resolveAuthenticatedCustomerId(req);
  if (forbidden) {
    return { ok: false, status: 403 };
  }
  if (!customerId) {
    return { ok: false, status: 401 };
  }

  return { ok: true, customerId, internal: false };
}

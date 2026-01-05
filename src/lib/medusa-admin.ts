import { cookies } from "next/headers";

/**
 * Medusa admin helper
 *
 * - Robust adminFetch with network error handling
 * - Helpful logs when ADMIN API key missing
 * - Utility helpers for capturing payments, updating metadata, etc.
 */

const DEFAULT_BACKEND =
  process.env.MEDUSA_BACKEND_URL ||
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  "http://localhost:9000";

const ADMIN_API_KEY =
  process.env.MEDUSA_ADMIN_API_KEY ||
  process.env.MEDUSA_ADMIN_TOKEN ||
  process.env.MEDUSA_ADMIN_BASIC ||
  "";

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  process.env.MEDUSA_PUBLISHABLE_KEY ||
  process.env.MEDUSA_PUBLISHABLE_API_KEY ||
  "";
const SALES_CHANNEL_ID =
  process.env.NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID || process.env.MEDUSA_SALES_CHANNEL_ID || "";

function getAdminHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(extra || {}),
  };

  if (ADMIN_API_KEY) {
    // Medusa v2 Secret Key requires Basic Auth
    // The key itself is the username, password is empty
    headers.Authorization = `Basic ${ADMIN_API_KEY}`;
    
    // Legacy support (optional, can keep or remove based on needs)
    headers["x-medusa-access-token"] = ADMIN_API_KEY;
  } else {
    // helpful warning for local/dev debugging
    if (process.env.NODE_ENV !== "test") {
      console.warn("medusa-admin: MEDUSA_ADMIN_API_KEY is not set; admin requests will be unauthenticated");
    }
  }

  return headers;
}

function medusaBaseUrl() {
  return DEFAULT_BACKEND.replace(/\/$/, "");
}

/**
 * adminFetch - wrapper around fetch to call Medusa Admin API
 */
export async function adminFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; raw: Response | null }> {
  const url = path.startsWith("http") ? path : `${medusaBaseUrl()}${path}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...init,
      // ensure our admin headers are merged with any provided headers (init.headers wins for conflicts)
      headers: {
        ...(getAdminHeaders(undefined) as Record<string, string>),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });

    let data: T | null = null;
    try {
      const text = await res.text();
      // attempt to parse JSON, but if empty or not JSON, keep null
      if (text && text.trim()) {
        data = JSON.parse(text) as T;
      }
    } catch {
      // ignore JSON parse errors (data stays null)
      data = null;
    }

    return { ok: res.ok, status: res.status, data, raw: res };
  } catch (err) {
    // network/DNS error or other runtime error
    console.error("medusa-admin: network error when calling", url, err);
    return {
      ok: false,
      status: 0,
      data: null,
      raw: null,
    };
  }
}

export async function getOrderById(orderId: string) {
  return adminFetch(`/admin/orders/${encodeURIComponent(orderId)}`);
}

export async function updateOrderMetadata(orderId: string, metadata: Record<string, unknown>) {
  return adminFetch(`/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "POST",
    body: JSON.stringify({ metadata }),
  });
}

export async function setOrderPaymentStatus(orderId: string, status: string) {
  return adminFetch(`/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "POST",
    body: JSON.stringify({ payment_status: status }),
  });
}

export async function setOrderPaidTotal(orderId: string, paidTotal: number) {
  return adminFetch(`/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "POST",
    body: JSON.stringify({ paid_total: paidTotal }),
  });
}

// Medusa 1.x compatible endpoint to register a payment when capture endpoints are unavailable
export async function registerOrderPayment(
  orderId: string,
  payload: {
    amount?: number;
    currency_code?: string;
    payment_id?: string;
    metadata?: Record<string, unknown>;
  }
) {
  return adminFetch(`/admin/orders/${encodeURIComponent(orderId)}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Medusa v2 register-payment helper
export async function registerOrderPaymentV2(
  orderId: string,
  payload: {
    amount?: number;
    currency_code?: string;
    payment_id?: string;
    metadata?: Record<string, unknown>;
  }
) {
  return adminFetch(`/admin/orders/${encodeURIComponent(orderId)}/register-payment`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

type PaymentCapturePayload = {
  amount?: number;
  currency_code?: string;
  payment_id?: string;
  order_id?: string;
  metadata?: Record<string, unknown>;
};

function hasCapturePayload(payload?: PaymentCapturePayload) {
  if (!payload) return false;
  return Object.values(payload).some((v) => v !== undefined);
}

type MedusaOrderMinimal = {
  id?: string;
  payment_collection_id?: string;
  paymentCollectionId?: string;
  payment_collection?: { id?: string; payment_collection_id?: string; payment_collections?: Array<{ id?: string }> };
  payment_collections?: Array<{ id?: string; payment_collection?: { id?: string } }>;
  metadata?: Record<string, unknown>;
};

function extractOrder(data: unknown): MedusaOrderMinimal | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const directOrder = root.order;
  if (directOrder && typeof directOrder === "object") return directOrder as MedusaOrderMinimal;
  const nestedData = root.data;
  if (nestedData && typeof nestedData === "object") {
    const nestedOrder = (nestedData as Record<string, unknown>).order;
    if (nestedOrder && typeof nestedOrder === "object") return nestedOrder as MedusaOrderMinimal;
    if (Array.isArray(nestedData) && nestedData[0] && typeof nestedData[0] === "object") {
      return nestedData[0] as MedusaOrderMinimal;
    }
  }
  return root as MedusaOrderMinimal;
}

export async function capturePaymentCollection(
  paymentCollectionId: string,
  payload?: PaymentCapturePayload
) {
  return adminFetch(
    `/admin/payment-collections/${encodeURIComponent(paymentCollectionId)}/capture`,
    {
      method: "POST",
      body: hasCapturePayload(payload) ? JSON.stringify(payload) : undefined,
    }
  );
}

/**
 * captureOrderPayment
 *
 * Tries multiple capture endpoints in order:
 * 1) POST /admin/orders/{id}/payment-capture
 * 2) POST /admin/orders/{id}/capture
 * 3) if order contains a payment_collection_id -> capture that
 *
 * Returns the first successful response or the last failure response.
 */
export async function captureOrderPayment(
  orderId: string,
  payload?: PaymentCapturePayload & { paymentCollectionId?: string }
) {
  const { paymentCollectionId: explicitCollectionId, ...rest } = payload || {};
  const body = hasCapturePayload(rest) ? JSON.stringify(rest) : undefined;

  const capturePaths = [
    `/admin/orders/${encodeURIComponent(orderId)}/payment-capture`,
    `/admin/orders/${encodeURIComponent(orderId)}/capture`,
  ];

  let lastRes:
    | Awaited<ReturnType<typeof adminFetch>>
    | Awaited<ReturnType<typeof capturePaymentCollection>>
    | null = null;

  // Try order capture endpoints first
  for (const path of capturePaths) {
    try {
      const res = await adminFetch(path, {
        method: "POST",
        body,
      });
      if (res.ok) return res;
      lastRes = res;
    } catch (err) {
      // adminFetch already catches but keep guard
      console.error("captureOrderPayment: error calling", path, err);
    }
  }

  // If explicit payment collection id provided, try it
  let paymentCollectionId = explicitCollectionId;
  if (!paymentCollectionId) {
    // fetch order to determine payment_collection_id
    try {
      const orderRes = await getOrderById(orderId);
      if (orderRes.ok && orderRes.data) {
        const order = extractOrder(orderRes.data);
        paymentCollectionId =
          order?.payment_collection_id ||
          order?.paymentCollectionId ||
          order?.payment_collection?.id ||
          order?.payment_collections?.[0]?.id ||
          order?.payment_collections?.[0]?.payment_collection?.id;
      } else {
        lastRes = orderRes;
      }
    } catch (err) {
      console.error("captureOrderPayment: failed to fetch order for paymentCollectionId", err);
    }
  }

  if (paymentCollectionId) {
    try {
      const captured = await capturePaymentCollection(paymentCollectionId, rest);
      if (captured.ok) return captured;
      lastRes = captured;
    } catch (err) {
      console.error("captureOrderPayment: capturePaymentCollection failed", err);
    }
  }

  return (
    lastRes || {
      ok: false,
      status: 0,
      data: null,
      raw: null,
    }
  );
}

type OrderTransactionPayload = {
  amount: number;
  currency_code: string;
  reference?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
};

export async function registerOrderTransaction(orderId: string, payload: OrderTransactionPayload) {
  return adminFetch(`/admin/orders/${encodeURIComponent(orderId)}/transactions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

type PaymentListFilters = {
  id?: string | string[];
  payment_session_id?: string | string[];
  limit?: number;
  offset?: number;
  fields?: string[];
};

function appendQueryParam(params: URLSearchParams, key: string, value: string | number | string[]) {
  if (Array.isArray(value)) {
    value.filter(Boolean).forEach((v) => params.append(key, String(v)));
  } else if (value !== undefined && value !== null && value !== "") {
    params.append(key, String(value));
  }
}

export async function listPayments(filters?: PaymentListFilters) {
  const params = new URLSearchParams();
  if (filters) {
    if (filters.limit !== undefined) {
      appendQueryParam(params, "limit", filters.limit);
    }
    if (filters.offset !== undefined) {
      appendQueryParam(params, "offset", filters.offset);
    }
    appendQueryParam(params, "payment_session_id", filters.payment_session_id ?? []);
    appendQueryParam(params, "id", filters.id ?? []);
    if (filters.fields?.length) {
      params.append("fields", filters.fields.join(","));
    }
  }
  const qs = params.toString();
  const path = `/admin/payments${qs ? `?${qs}` : ""}`;
  return adminFetch<{
    payments?: Array<Record<string, unknown>>;
    count?: number;
    offset?: number;
    limit?: number;
  }>(path);
}

export async function getPayment(paymentId: string) {
  return adminFetch(`/admin/payments/${encodeURIComponent(paymentId)}`);
}

export async function capturePayment(
  paymentId: string,
  payload?: {
    amount?: number;
  }
) {
  const body: Record<string, unknown> = {};
  if (typeof payload?.amount === "number") {
    body.amount = payload.amount;
  }
  return adminFetch(`/admin/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function convertDraftOrder(orderId: string) {
  return adminFetch(`/admin/draft-orders/${encodeURIComponent(orderId)}/convert-to-order`, {
    method: "POST",
  });
}

export async function deleteDraftOrder(orderId: string) {
  return adminFetch(`/admin/draft-orders/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
  });
}

export async function createDraftOrder(payload: Record<string, unknown>) {
  return adminFetch(`/admin/draft-orders`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type StoreCart = Record<string, unknown>;

export async function readStoreCart(cartId: string | undefined) {
  if (!cartId) return null;
  try {
    const res = await fetch(`${medusaBaseUrl()}/store/carts/${encodeURIComponent(cartId)}`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...(PUBLISHABLE_KEY ? { "x-publishable-api-key": PUBLISHABLE_KEY } : {}),
        ...(SALES_CHANNEL_ID ? { "x-sales-channel-id": SALES_CHANNEL_ID } : {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as { cart: StoreCart };
  } catch (err) {
    console.error("readStoreCart network error", err);
    return null;
  }
}

export async function getCartIdFromCookie(): Promise<string | undefined> {
  const c = (await cookies()).get("cart_id");
  return c?.value;
}

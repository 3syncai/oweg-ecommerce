import crypto from "crypto";

const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

/**
 * NOTE: This helper assumes the `amount` you pass to `createRazorpayOrder`
 * is in the **major currency unit** (e.g. INR rupees). The function will
 * convert to paise (×100) automatically because Razorpay API expects smallest unit.
 * If you already pass paise, set `amountIsPaise: true` in options.
 */

type RazorpayOrderPayload = {
  amount: number; // amount in major currency unit (eg. 1270 -> ₹1270) by default
  currency: string;
  receipt?: string;
  notes?: Record<string, string>;
};

export type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt: string | null;
};

export type RazorpayPaymentEntity = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  method?: string;
  order_id?: string;
  error_code?: string;
  error_description?: string;
};

export type RazorpayMethodsResponse = {
  netbanking?: Record<string, string>;
  wallet?: Record<string, string>;
  upi?: boolean | Record<string, unknown>;
  card?: boolean | Record<string, unknown>;
};

function getAuthHeader() {
  if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
    throw new Error("Missing Razorpay credentials: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
  }
  const token = Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

function getKeyIdAuthHeader() {
  const keyId = RZP_KEY_ID || PUBLIC_KEY;
  if (!keyId) {
    throw new Error("Razorpay key id is not configured");
  }
  return `Basic ${Buffer.from(`${keyId}:`).toString("base64")}`;
}

export async function razorpayApiRequest<T>(
  path: string,
  options?: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    auth?: "secret" | "key_id";
    timeoutMs?: number;
  }
): Promise<T> {
  const method = options?.method ?? "GET";
  const timeoutMs = options?.timeoutMs ?? 15000;
  const authHeader = options?.auth === "key_id" ? getKeyIdAuthHeader() : getAuthHeader();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`https://api.razorpay.com${path}`, {
      method,
      headers: {
        Authorization: authHeader,
        "content-type": "application/json",
      },
      body: method === "POST" ? JSON.stringify(options?.body ?? {}) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Razorpay API ${path} failed (${res.status}): ${text || "no body"}`);
    }

    return (await res.json()) as T;
  } catch (err: unknown) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * createRazorpayOrder
 * - `payload.amount` is expected in major currency unit (e.g. rupees).
 * - set options.amountIsPaise = true if you are already passing paise.
 */
export async function createRazorpayOrder(
  payload: RazorpayOrderPayload,
  options?: { amountIsPaise?: boolean; timeoutMs?: number }
): Promise<RazorpayOrderResponse> {
  const amountIsPaise = !!options?.amountIsPaise;
  const timeoutMs = options?.timeoutMs ?? 10000; // 10s default timeout

  // convert to paise if needed
  const amountPaise = amountIsPaise ? Math.round(payload.amount) : Math.round(payload.amount * 100);

  const body = {
    payment_capture: 1,
    amount: amountPaise,
    currency: payload.currency,
    receipt: payload.receipt ?? null,
    notes: payload.notes ?? undefined,
  };

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(id);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // include helpful hint when DNS/network fail to reach host
      throw new Error(`Razorpay order creation failed (${res.status}): ${text || "no response body"}`);
    }

    const json = (await res.json()) as RazorpayOrderResponse;
    return json;
  } catch (err: unknown) {
    clearTimeout(id);
    // Distinguish fetch abort / network errors vs thrown HTTP errors
    if ((err as { name?: string })?.name === "AbortError") {
      throw new Error(`Razorpay request timed out after ${timeoutMs}ms`);
    }
    // If system-level DNS/network error (ENOTFOUND), surface helpful message
    const errCode = (err as { code?: string })?.code;
    const errMessage = (err as { message?: string })?.message;
    if (errCode === "ENOTFOUND" || /ENOTFOUND/i.test(String(errMessage || ""))) {
      throw new Error(`Network/DNS error reaching Razorpay: ${errMessage || err}. Check your internet/DNS/VPN.`);
    }
    throw err;
  }
}

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPaymentEntity> {
  return razorpayApiRequest<RazorpayPaymentEntity>(`/v1/payments/${paymentId}`, { method: "GET" });
}

export async function fetchRazorpayMethods(): Promise<RazorpayMethodsResponse> {
  return razorpayApiRequest<RazorpayMethodsResponse>("/v1/methods", {
    method: "GET",
    auth: "key_id",
  });
}

export function verifyCheckoutPaymentSignature(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): boolean {
  const secret = RZP_KEY_SECRET;
  if (!secret) return false;
  const generated = crypto
    .createHmac("sha256", secret)
    .update(`${payload.razorpay_order_id}|${payload.razorpay_payment_id}`)
    .digest("hex");
  return generated === payload.razorpay_signature;
}

/**
 * verifyRazorpaySignature
 * - Safely compares HMAC digest and incoming signature using timingSafeEqual.
 * - Returns false if signature missing or secret missing or lengths mismatch.
 */
export function verifyRazorpaySignature(rawBody: string | Buffer, signature: string | null | undefined): boolean {
  if (!signature) return false;
  if (!WEBHOOK_SECRET) {
    console.warn("verifyRazorpaySignature: RAZORPAY_WEBHOOK_SECRET is not set");
    return false;
  }

  try {
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
    // Razorpay signs the raw request body bytes; use them directly to avoid encoding differences.
    const digest = crypto.createHmac("sha256", WEBHOOK_SECRET).update(bodyBuffer).digest();
    const sigBuf = Buffer.from(signature, "hex");
    const digBuf = Buffer.from(digest);

    // timingSafeEqual requires buffers of same length — if not same length, reject.
    if (sigBuf.length !== digBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(digBuf, sigBuf);
  } catch (err) {
    console.error("verifyRazorpaySignature: unexpected error", err);
    return false;
  }
}

/**
 * getPublicRazorpayKey
 * - returns the publishable key (NEXT_PUBLIC_ preferred), fallback to server key id if needed.
 */
export function getPublicRazorpayKey(): string {
  const key = PUBLIC_KEY || RZP_KEY_ID || "";
  if (!key) {
    throw new Error("Razorpay public key is not configured (set NEXT_PUBLIC_RAZORPAY_KEY_ID or RAZORPAY_KEY_ID)");
  }
  return key;
}

export function getSiteOrigin(fallback = "http://localhost:3000"): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return fallback;
}

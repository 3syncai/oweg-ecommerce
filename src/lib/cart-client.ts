import { getGuestCartId, setGuestCartId } from "@/lib/guest-cart";
import type { CartApiPayload } from "@/lib/cart-helpers";

// One write at a time, including first-cart creation and publishing the response.
// A rejected write must not prevent later operations from running.
let writes: Promise<void> = Promise.resolve();
let revision = 0;

export function queueCartWrite<T>(operation: () => Promise<T>): Promise<T> {
  revision++;
  const result = writes.then(async () => {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    return locks ? locks.request("oweg-cart-write", operation) : operation();
  });
  writes = result.then(() => undefined, () => undefined);
  return result;
}

function headers() {
  const id = getGuestCartId();
  return { "content-type": "application/json", ...(id ? { "x-guest-cart-id": id } : {}) };
}

async function payload(response: Response): Promise<CartApiPayload> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Unable to load or update your cart. Please try again.");
  }
  const cart = data?.cart ?? data;
  if (!cart || (!Array.isArray(cart.items) && !Array.isArray(cart.line_items))) {
    throw new Error("Cart response is incomplete. Please refresh your cart.");
  }
  return data;
}

export async function readCart(signal?: AbortSignal): Promise<CartApiPayload> {
  // A GET started before a write must not publish an obsolete/empty cart afterwards.
  for (;;) {
    const pending = writes;
    await pending;
    signal?.throwIfAborted();
    if (pending !== writes) continue;
    const started = revision;
    const response = await fetch("/api/medusa/cart", {
      headers: headers(), credentials: "include", cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    });
    const data = await payload(response);
    if (started !== revision) continue;
    if (typeof data.guestCartId === "string") setGuestCartId(data.guestCartId);
    return data;
  }
}

export async function writeCart(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>,
): Promise<CartApiPayload> {
  // Never automatically retry a write: a lost response does not mean it failed.
  const data = await payload(await fetch(path, {
    method, headers: headers(), credentials: "include", signal: AbortSignal.timeout(60_000),
    body: body ? JSON.stringify(body) : undefined,
  }));
  if (typeof data.guestCartId === "string") setGuestCartId(data.guestCartId);
  return data;
}

import {
  loadRazorpayCustomScript,
  prefetchRazorpayConnections,
} from "@/lib/razorpay-custom-client";

export type RazorpayMethodsPayload = {
  netbanking?: Record<string, string>;
  wallet?: Record<string, string>;
};

let sdkWarmStarted = false;
let methodsCache: RazorpayMethodsPayload | null = null;
let methodsPromise: Promise<RazorpayMethodsPayload | null> | null = null;

/** Preconnect + load Razorpay custom checkout SDK (idempotent). */
export function warmRazorpayCheckout(options?: { prefetchMethods?: boolean }): void {
  if (typeof window === "undefined") return;

  if (!sdkWarmStarted) {
    sdkWarmStarted = true;
    prefetchRazorpayConnections();
    void loadRazorpayCustomScript().catch(() => undefined);
  }

  if (options?.prefetchMethods !== false) {
    void prefetchRazorpayMethods().catch(() => undefined);
  }
}

/** Fetch banks/wallets once and cache for the payment form. */
export async function prefetchRazorpayMethods(): Promise<RazorpayMethodsPayload | null> {
  if (methodsCache) return methodsCache;
  if (methodsPromise) return methodsPromise;

  methodsPromise = fetch("/api/checkout/razorpay/methods", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as { methods?: RazorpayMethodsPayload };
      const methods = data.methods;
      if (methods && typeof methods === "object") {
        methodsCache = methods;
        return methods;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      methodsPromise = null;
    });

  return methodsPromise;
}

export function getCachedRazorpayMethods(): RazorpayMethodsPayload | null {
  return methodsCache;
}

export function invalidateRazorpayMethodsCache(): void {
  methodsCache = null;
}

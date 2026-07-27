const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

let scriptLoadPromise: Promise<void> | null = null;

export type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  close?: () => void;
  on?: (event: string, handler: (response: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

/** Idempotent — safe to call multiple times; resolves when checkout.js is ready. */
export function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only load in the browser"));
  }
  if (window.Razorpay) {
    return Promise.resolve();
  }
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${RAZORPAY_SCRIPT_URL}"]`
  );
  if (existing) {
    scriptLoadPromise = new Promise((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay SDK")), {
        once: true,
      });
    });
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error("Failed to load Razorpay SDK"));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export function prefetchRazorpayConnections(): void {
  if (typeof document === "undefined") return;
  const origins = ["https://checkout.razorpay.com", "https://api.razorpay.com"];
  for (const href of origins) {
    if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

/** Open Razorpay Standard Checkout modal (method selection happens inside Razorpay). */
export async function openRazorpayCheckout(options: {
  key: string;
  amountMinor: number;
  currency: string;
  orderId: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  callbackUrl?: string;
  notes?: Record<string, string>;
  onSuccess?: (response: RazorpaySuccessResponse) => void | Promise<void>;
  onFailure?: (error: unknown) => void | Promise<void>;
  onDismiss?: () => void | Promise<void>;
}): Promise<void> {
  await loadRazorpayScript();

  const RazorpayCtor = window.Razorpay;
  if (!RazorpayCtor) {
    throw new Error("Razorpay checkout SDK unavailable");
  }

  let settled = false;

  const dismissOnce = () => {
    if (settled) return;
    settled = true;
    if (options.onDismiss) {
      void options.onDismiss();
    } else {
      void options.onFailure?.({ reason: "dismissed" });
    }
  };

  const razorpay = new RazorpayCtor({
    key: options.key,
    amount: options.amountMinor,
    currency: options.currency,
    order_id: options.orderId,
    name: options.name || "OWEG",
    description: options.description || "Order payment",
    prefill: options.prefill || {},
    notes: options.notes || {},
    ...(options.callbackUrl ? { callback_url: options.callbackUrl } : {}),
    handler: (response: RazorpaySuccessResponse) => {
      if (settled) return;
      settled = true;
      void options.onSuccess?.(response);
    },
    modal: {
      ondismiss: () => {
        dismissOnce();
      },
    },
  });

  // payment.failed is non-terminal: Standard Checkout allows retries in the same
  // modal. Only handler (success) or modal.ondismiss should settle the session.
  razorpay.on?.("payment.failed", () => {
    /* intentionally ignore — wait for retry success or dismiss */
  });

  razorpay.open();
}

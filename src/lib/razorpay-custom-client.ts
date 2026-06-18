const RAZORPAY_CUSTOM_SCRIPT = "https://checkout.razorpay.com/v1/razorpay.js";

let customScriptPromise: Promise<void> | null = null;

export type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type CustomPaymentMethod = "upi" | "card" | "netbanking" | "wallet";

export type CustomPaymentPayload = {
  method: CustomPaymentMethod;
  bank?: string;
  wallet?: string;
  upiAppPackage?: string;
  upiFlow?: "intent" | "qr";
  card?: {
    name: string;
    number: string;
    expiry: string;
    cvv: string;
  };
};

type RazorpayCustomInstance = {
  createPayment: (data: Record<string, unknown>) => void;
  on: (event: string, handler: (response: unknown) => void) => void;
  open?: () => void;
  close?: () => void;
};

function getRazorpayCtor(): (new (options: Record<string, unknown>) => RazorpayCustomInstance) | undefined {
  return (window as unknown as { Razorpay?: new (options: Record<string, unknown>) => RazorpayCustomInstance })
    .Razorpay;
}

/** Custom Checkout script — no Razorpay modal; use createPayment() from your own UI. */
export function loadRazorpayCustomScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only load in the browser"));
  }

  if (customScriptPromise) return customScriptPromise;

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${RAZORPAY_CUSTOM_SCRIPT}"]`
  );

  customScriptPromise = new Promise((resolve, reject) => {
    const onReady = () => resolve();

    if (getRazorpayCtor()) {
      resolve();
      return;
    }

    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay SDK")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_CUSTOM_SCRIPT;
    script.async = true;
    script.onload = onReady;
    script.onerror = () => {
      customScriptPromise = null;
      reject(new Error("Failed to load Razorpay custom SDK"));
    };
    document.head.appendChild(script);
  });

  return customScriptPromise;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function buildPaymentData(
  options: {
    amountMinor: number;
    currency: string;
    orderId: string;
    email: string;
    contact: string;
    medusaOrderId: string;
  },
  payload: CustomPaymentPayload
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    amount: String(options.amountMinor),
    currency: options.currency,
    order_id: options.orderId,
    email: options.email,
    contact: options.contact,
    method: payload.method,
    notes: {
      medusa_order_id: options.medusaOrderId,
    },
  };

  if (payload.method === "netbanking" && payload.bank) {
    data.bank = payload.bank;
  }

  if (payload.method === "wallet" && payload.wallet) {
    data.wallet = payload.wallet;
  }

  if (payload.method === "upi") {
    if (payload.upiAppPackage) {
      data["_[flow]"] = "intent";
      data.upi_app_package_name = payload.upiAppPackage;
    } else {
      data["_[flow]"] = payload.upiFlow ?? "qr";
    }
  }

  if (payload.method === "card" && payload.card) {
    const card = payload.card;
    data["card[name]"] = card.name;
    data["card[number]"] = card.number.replace(/\s+/g, "");
    data["card[expiry]"] = card.expiry;
    data["card[cvv]"] = card.cvv;
  }

  return data;
}

function usesRedirect(payload: CustomPaymentPayload): boolean {
  return payload.method === "netbanking" || payload.method === "wallet";
}

export async function submitCustomRazorpayPayment(options: {
  key: string;
  amountMinor: number;
  currency: string;
  orderId: string;
  medusaOrderId: string;
  email: string;
  contact: string;
  callbackUrl: string;
  payload: CustomPaymentPayload;
  onSuccess?: (response: RazorpaySuccessResponse) => void;
  onFailure?: (error: unknown) => void;
}): Promise<void> {
  await loadRazorpayCustomScript();

  const RazorpayCtor = getRazorpayCtor();
  if (!RazorpayCtor) {
    throw new Error("Razorpay custom SDK unavailable");
  }

  const paymentData = buildPaymentData(
    {
      amountMinor: options.amountMinor,
      currency: options.currency,
      orderId: options.orderId,
      email: options.email,
      contact: options.contact,
      medusaOrderId: options.medusaOrderId,
    },
    options.payload
  );

  const redirect = usesRedirect(options.payload);

  const razorpay = new RazorpayCtor({
    key: options.key,
    callback_url: options.callbackUrl,
    redirect,
    handler: (response: RazorpaySuccessResponse) => {
      options.onSuccess?.(response);
    },
  });

  razorpay.on("payment.failed", (response: unknown) => {
    options.onFailure?.(response);
  });

  razorpay.createPayment(paymentData);
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

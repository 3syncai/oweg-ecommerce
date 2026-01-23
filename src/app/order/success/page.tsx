"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import Image from "next/image";

type OrderSummary = {
  id: string;
  payment_status?: string;
  is_draft_order?: boolean;
  total?: number; // NOTE: unit ambiguous between rupees or paise. See display logic below.
  currency_code?: string;
  items?: Array<{
    id: string;
    title: string;
    quantity: number;
    total: number;
    thumbnail?: string;
  }>;
  shipping_address?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
});

function OrderSuccessPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get("orderId") || "";
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const pollAttempts = useRef(0);
  const clearedCartRef = useRef(false);
  const maxPollAttempts = 12; // 12 * 5s = 60s

  async function fetchOrder() {
    if (!orderId) return null;
    setLoading(true);
    try {
      const res = await fetch(`/api/checkout/order-summary?orderId=${encodeURIComponent(orderId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.order as OrderSummary;
    } catch (err) {
      console.error("fetchOrder error", err);
      return null;
    } finally {
      setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    if (!orderId) return;
    let mounted = true;
    (async () => {
      const o = await fetchOrder();
      if (mounted && o) setOrder(o);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // polling effect: when polling toggled on, poll until confirmed or max attempts
  useEffect(() => {
    if (!orderId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      pollAttempts.current += 1;
      const latest = await fetchOrder();
      if (cancelled) return;
      if (latest) {
        setOrder(latest);
        const statusValue =
          typeof latest?.metadata?.razorpay_payment_status === "string"
            ? latest.metadata?.razorpay_payment_status
            : typeof latest?.payment_status === "string"
              ? latest.payment_status
              : undefined;
        const isConfirmed = statusValue === "captured" || statusValue === "paid" || statusValue === "cod";
        if (isConfirmed || pollAttempts.current >= maxPollAttempts) {
          setPolling(false);
          return;
        }
      }
      // schedule next
      timer = setTimeout(() => {
        void tick();
      }, 5000);
    }

    if (polling) {
      pollAttempts.current = 0;
      void tick();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, orderId]);

  // computed helpers
  const metadataStatus =
    typeof order?.metadata?.razorpay_payment_status === "string"
      ? order.metadata?.razorpay_payment_status
      : undefined;
  const rawPaymentStatus =
    metadataStatus || (typeof order?.payment_status === "string" ? order.payment_status : undefined);
  const isPaid = rawPaymentStatus === "captured" || rawPaymentStatus === "paid" || rawPaymentStatus === "cod";
  const paymentStatusLabel = isPaid ? "paid" : rawPaymentStatus || "pending";

  const orderMode =
    typeof order?.metadata?.mode === "string" ? (order?.metadata?.mode as string) : undefined;
  const orderPaymentMethod =
    typeof order?.metadata?.payment_method === "string"
      ? (order?.metadata?.payment_method as string)
      : undefined;

  // Clear cart once payment is confirmed (only for normal cart checkouts)
  useEffect(() => {
    const shouldClear = isPaid || orderPaymentMethod === "cod";
    if (!shouldClear || clearedCartRef.current) return;
    if (orderMode === "buy_now") {
      clearedCartRef.current = true;
      if (typeof window !== "undefined") {
        localStorage.removeItem("buy_now_item");
      }
      return;
    }

    const clearCart = async () => {
      try {
        const guestCartId =
          typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null;
        await fetch("/api/medusa/cart/clear", {
          method: "POST",
          credentials: "include",
          headers: {
            ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
          },
        });
      } catch (err) {
        console.warn("Failed to clear cart after order", err);
      } finally {
        clearedCartRef.current = true;
        if (typeof window !== "undefined") {
          localStorage.removeItem("guest_cart_id");
          localStorage.removeItem("buy_now_item");
        }
      }
    };

    void clearCart();
  }, [isPaid, orderMode, orderPaymentMethod]);

  // Display amount helper:
  // Order totals are stored in Paise (minor units), divide by 100 for display
  function formatAmount(rawTotal?: number | undefined) {
    if (rawTotal === undefined || rawTotal === null) return "N/A";
    return INR.format(rawTotal / 100);
  }

  function formatItemAmount(raw?: number) {
    if (raw === undefined || raw === null) return "N/A";
    return INR.format(raw);
  }

  // Calculate coins earned (1% of order total)
  useEffect(() => {
    if (order && isPaid) {
      // Use the same total value as displayed (paid_total if available, otherwise total)
      const rawTotal = typeof (order as OrderSummary & { paid_total?: number })?.paid_total === "number"
        ? (order as OrderSummary & { paid_total?: number }).paid_total
        : order?.total;

      if (rawTotal && rawTotal > 0) {
        // rawTotal is in paise (minor units), convert to rupees
        const totalInRupees = rawTotal / 100;
        const earned = parseFloat((totalInRupees * 0.01).toFixed(2)); // 1% cashback
        console.log("Coins calculation:", { rawTotal, totalInRupees, earned });
        setCoinsEarned(earned);
      }
    }
  }, [order, isPaid]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="bg-white shadow-md rounded-2xl p-6 md:p-8 max-w-3xl w-full space-y-6">
        <div className="flex items-start gap-4">
          <div
            className={`h-12 w-12 rounded-full flex items-center justify-center ${isPaid ? "bg-green-100" : "bg-yellow-100"
              }`}
          >
            <span className="text-2xl">{isPaid ? "✅" : "⌛"}</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Thanks for ordering!</h1>
            <p className="text-sm text-slate-600">
              {isPaid
                ? "Your payment is confirmed. We'll share updates on your order."
                : rawPaymentStatus
                  ? "Payment received (pending confirmation). We're waiting for Razorpay/Medusa to confirm."
                  : "Payment received. We're waiting for Razorpay to confirm."}
            </p>
            {orderId && (
              <p className="text-xs text-slate-500 mt-2">
                Order reference: <span className="font-semibold">{orderId}</span>
              </p>
            )}
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <div className="flex justify-between text-sm text-slate-700">
            <span>Status</span>
            <span className="font-semibold capitalize">{paymentStatusLabel}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-700">
            <span>Total paid</span>
            <span className="font-semibold">
              {formatAmount(
                typeof (order as OrderSummary & { paid_total?: number })?.paid_total === "number"
                  ? (order as OrderSummary & { paid_total?: number }).paid_total
                  : order?.total
              )}
            </span>
          </div>
        </div>

        {/* Coins Earned Section */}
        {isPaid && coinsEarned !== null && coinsEarned > 0 && (
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                <img src="/uploads/coin/oweg_bag.png" alt="Coins" className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <p className="text-amber-800 font-semibold">You earned coins!</p>
                <p className="text-amber-700 text-sm">
                  <span className="text-lg font-bold flex items-center gap-1">
                    <img src="/uploads/coin/coin.png" alt="Coin" className="w-6 h-6 object-contain" />
                    {coinsEarned.toFixed(0)}
                  </span> coins (1% cashback)
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Use these coins on your next order. 1 coin = ₹1 discount!
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Items</h2>
          <div className="border rounded-lg divide-y">
            {order?.items?.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3">
                <div className="h-12 w-12 bg-slate-100 relative rounded overflow-hidden">
                  {item.thumbnail ? (
                    // Note: ensure your next.config.js allows the S3 domain in images.domains
                    <Image src={item.thumbnail} alt={item.title} fill className="object-contain" />
                  ) : null}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 line-clamp-2">{item.title}</p>
                  <p className="text-xs text-slate-500">Qty {item.quantity}</p>
                </div>
                <div className="text-sm font-semibold text-slate-900">{formatItemAmount(item.total)}</div>
              </div>
            ))}
            {!order?.items?.length && (
              <div className="p-4 text-sm text-slate-500 text-center">We&apos;ll load your items shortly.</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <Button onClick={() => router.push("/")}>Continue shopping</Button>
          <Button variant="outline" onClick={() => router.push("/cart")}>
            View cart
          </Button>
          <Button variant="ghost" onClick={() => router.push("/orders")}>
            View my orders
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={async () => {
                setPolling(false);
                pollAttempts.current = 0;
                setLoading(true);
                const latest = await fetchOrder();
                setLoading(false);
                if (latest) setOrder(latest);
              }}
            >
              Refresh now
            </Button>

            {!isPaid && (
              <Button
                variant="secondary"
                onClick={() => {
                  // start polling
                  setPolling(true);
                }}
                disabled={loading || polling}
              >
                {polling ? "Polling..." : "Poll for status"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-600">
          Loading order...
        </div>
      }
    >
      <OrderSuccessPageInner />
    </Suspense>
  );
}

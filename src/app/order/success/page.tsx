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
  const pollAttempts = useRef(0);
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

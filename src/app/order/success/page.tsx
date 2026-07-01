"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Loader2,
  Package,
  Receipt,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatOrderCurrency } from "@/lib/order-utils";

type OrderSummary = {
  id: string;
  payment_status?: string;
  is_draft_order?: boolean;
  total?: number;
  display_totals?: { grandTotal?: number };
  currency_code?: string;
  items?: Array<{
    id: string;
    title: string;
    quantity: number;
    unit_price?: number;
    total: number;
    thumbnail?: string;
  }>;
  shipping_address?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type OrderLineItem = NonNullable<OrderSummary["items"]>[number];

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
});

type StatusVariant = "success" | "cod-pending" | "payment-pending";

function resolveOrderTotalRupees(order: OrderSummary | null): number | undefined {
  const total = order?.display_totals?.grandTotal ?? order?.total;
  return typeof total === "number" && total >= 0 ? total : undefined;
}

function OrderStatusIcon({ variant }: { variant: StatusVariant }) {
  if (variant === "success") {
    return (
      <div className="relative shrink-0">
        <span className="absolute inset-0 rounded-full bg-emerald-400/30 order-success-ring" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 shadow-lg shadow-emerald-600/25 order-success-scale-in">
          <svg
            className="h-8 w-8 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 13l4 4L19 7" className="order-success-check-draw" />
          </svg>
        </div>
      </div>
    );
  }

  if (variant === "cod-pending") {
    return (
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-amber-200 bg-amber-50 order-success-scale-in">
        <Package className="h-7 w-7 text-amber-600" strokeWidth={1.75} aria-hidden />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" aria-hidden />
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-sky-200 bg-sky-50 order-success-scale-in">
      <Loader2 className="h-7 w-7 animate-spin text-sky-600" strokeWidth={1.75} aria-hidden />
    </div>
  );
}

function OrderSuccessPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get("orderId") || "";
  const isConfirmingFlow = params.get("confirming") === "1";
  const isCodCheckout = params.get("cod") === "1";
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [autoPollingStarted, setAutoPollingStarted] = useState(false);
  const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
  const pollAttempts = useRef(0);
  const clearedCartRef = useRef(false);
  const maxPollAttempts = 30;
  const pollIntervalMs = isConfirmingFlow ? 1000 : 2000;

  async function confirmCodOrder(refId: string) {
    const res = await fetch("/api/checkout/cod", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ medusaOrderId: refId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { medusaOrderId?: string };
    return data.medusaOrderId || refId;
  }

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

  useEffect(() => {
    if (!orderId || !isConfirmingFlow || !isCodCheckout) return;
    let cancelled = false;

    (async () => {
      try {
        const finalId = await confirmCodOrder(orderId);
        if (cancelled || !finalId || finalId === orderId) return;
        router.replace(`/order/success?orderId=${encodeURIComponent(finalId)}&confirming=1&cod=1`);
      } catch (err) {
        console.error("cod background confirm failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, isConfirmingFlow, isCodCheckout, router]);

  useEffect(() => {
    if (!orderId || !isConfirmingFlow || isCodCheckout) return;
    let cancelled = false;

    (async () => {
      try {
        await fetch("/api/checkout/razorpay/reconcile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ medusaOrderId: orderId }),
        });
        if (!cancelled) {
          const o = await fetchOrder();
          if (o) setOrder(o);
        }
      } catch (err) {
        console.error("razorpay reconcile failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, isConfirmingFlow, isCodCheckout]);

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
        const codStatus =
          typeof latest?.metadata?.cod_status === "string" ? latest.metadata.cod_status : undefined;
        const statusValue =
          typeof latest?.metadata?.razorpay_payment_status === "string"
            ? latest.metadata?.razorpay_payment_status
            : typeof latest?.payment_status === "string"
              ? latest.payment_status
              : undefined;
        const isConfirmed =
          codStatus === "confirmed" ||
          statusValue === "captured" ||
          statusValue === "paid" ||
          statusValue === "cod";
        if (isConfirmed || pollAttempts.current >= maxPollAttempts) {
          setPolling(false);
          return;
        }
      }
      timer = setTimeout(() => {
        void tick();
      }, pollIntervalMs);
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

  const metadataStatus =
    typeof order?.metadata?.razorpay_payment_status === "string"
      ? order.metadata?.razorpay_payment_status
      : undefined;
  const rawPaymentStatus =
    metadataStatus || (typeof order?.payment_status === "string" ? order.payment_status : undefined);
  const orderPaymentMethod =
    typeof order?.metadata?.payment_method === "string"
      ? (order.metadata.payment_method as string)
      : undefined;
  const isCod = isCodCheckout || orderPaymentMethod === "cod" || rawPaymentStatus === "cod";
  const codStatus =
    typeof order?.metadata?.cod_status === "string" ? order.metadata.cod_status : undefined;
  const isCodPending = isCodCheckout && isConfirmingFlow && codStatus !== "confirmed";
  const isPaidOnline = rawPaymentStatus === "captured" || rawPaymentStatus === "paid";
  const isOrderComplete = isPaidOnline || (isCod && !isCodPending);
  const isPaid = isOrderComplete;
  const paymentStatusLabel = isCod ? "Cash on Delivery" : isPaidOnline ? "Paid" : rawPaymentStatus || "Pending";

  const statusMessage = isCodPending
    ? "We're confirming your order. This usually takes a few seconds."
    : isCod
      ? "Your order is confirmed. Pay when your order arrives."
      : isPaidOnline
        ? "Your payment is confirmed. We'll share updates on your order."
        : rawPaymentStatus
          ? "Payment received. Waiting for Razorpay to confirm."
          : "Payment received. Waiting for confirmation.";

  const statusVariant: StatusVariant = isCodPending
    ? "cod-pending"
    : isOrderComplete
      ? "success"
      : "payment-pending";

  const orderMode =
    typeof order?.metadata?.mode === "string" ? (order.metadata.mode as string) : undefined;

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

  useEffect(() => {
    if (!orderId || !isConfirmingFlow || isCodCheckout) return;
    if (isPaidOnline || polling || autoPollingStarted) return;
    setAutoPollingStarted(true);
    setPolling(true);
  }, [autoPollingStarted, isCodCheckout, isConfirmingFlow, isPaidOnline, orderId, polling]);

  useEffect(() => {
    if (!orderId || !isConfirmingFlow || !isCodPending) return;
    if (polling || autoPollingStarted) return;
    setAutoPollingStarted(true);
    setPolling(true);
  }, [autoPollingStarted, isCodPending, isConfirmingFlow, orderId, polling]);

  function formatItemAmount(item: OrderLineItem) {
    if (!item) return "N/A";
    const qty = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = typeof item.unit_price === "number" ? item.unit_price : undefined;
    const lineTotal =
      unitPrice && unitPrice > 0 && unitPrice < 10000
        ? unitPrice * qty
        : item.total;
    if (lineTotal === undefined || lineTotal === null) return "N/A";
    return INR.format(lineTotal);
  }

  const totalRupees = resolveOrderTotalRupees(order);
  const displayTotal =
    totalRupees !== undefined
      ? formatOrderCurrency(totalRupees, order?.currency_code)
      : "N/A";

  useEffect(() => {
    if (order && isPaid) {
      const totalInRupees = resolveOrderTotalRupees(order);
      if (totalInRupees !== undefined && totalInRupees > 0) {
        const earned = parseFloat((totalInRupees * 0.01).toFixed(2));
        setCoinsEarned(earned);
      }
    }
  }, [order, isPaid]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/40 px-4 py-10 md:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/60">
          {/* Hero */}
          <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50/80 via-white to-white px-6 py-8 md:px-8 md:py-10">
            <div className="flex flex-col items-center text-center">
              <OrderStatusIcon variant={statusVariant} />

              <div
                className="mt-6 space-y-2 order-success-slide-up"
                style={{ animationDelay: "0.12s" }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                  {isCodPending ? "Processing" : isCod ? "Order placed" : isPaidOnline ? "Payment successful" : "Processing payment"}
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                  Thanks for ordering
                </h1>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-600">{statusMessage}</p>
              </div>

              {(isCodPending || (!isPaidOnline && !isCod && isConfirmingFlow)) && (
                <div
                  className="mt-4 flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-4 py-2 text-xs text-amber-800 order-success-slide-up"
                  style={{ animationDelay: "0.2s" }}
                >
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                  <span>{isCodPending ? "Finalizing your COD order…" : "Confirming payment…"}</span>
                </div>
              )}

              {orderId && (
                <div
                  className="mt-5 w-full max-w-sm order-success-slide-up"
                  style={{ animationDelay: "0.28s" }}
                >
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Order reference
                  </p>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 font-mono text-xs text-slate-700 break-all">
                    {orderId}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5 p-6 md:p-8">
            {/* Summary cards */}
            <div
              className="grid grid-cols-2 gap-3 order-success-slide-up"
              style={{ animationDelay: "0.34s" }}
            >
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-500">
                  {isCod ? (
                    <Banknote className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  )}
                  <span className="text-xs font-medium">Status</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">{paymentStatusLabel}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-500">
                  <Receipt className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  <span className="text-xs font-medium">{isCod ? "Order total" : "Total paid"}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">{displayTotal}</p>
              </div>
            </div>

            {/* Coins */}
            {isOrderComplete && coinsEarned !== null && coinsEarned > 0 && (
              <div
                className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 order-success-slide-up"
                style={{ animationDelay: "0.4s" }}
              >
                <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-amber-200/30 blur-2xl" />
                <div className="relative flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <img src="/uploads/coin/oweg_bag.png" alt="" className="h-8 w-8 object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-amber-600" strokeWidth={1.75} aria-hidden />
                      <p className="font-semibold text-amber-900">You earned coins</p>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-amber-800">
                      <img src="/uploads/coin/coin.png" alt="" className="h-5 w-5 object-contain" />
                      <span className="font-bold">{coinsEarned.toFixed(0)}</span>
                      <span>coins · 1% cashback</span>
                    </p>
                    <p className="mt-1 text-xs text-amber-700/90">1 coin = ₹1 off your next order</p>
                  </div>
                </div>
              </div>
            )}

            {/* Items */}
            <div className="order-success-slide-up" style={{ animationDelay: "0.46s" }}>
              <div className="mb-3 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-slate-500" strokeWidth={1.75} aria-hidden />
                <h2 className="text-sm font-semibold text-slate-800">Items in this order</h2>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-100 divide-y divide-slate-100">
                {order?.items?.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-white p-3.5 transition-colors hover:bg-slate-50/80 order-success-slide-up"
                    style={{ animationDelay: `${0.5 + index * 0.06}s` }}
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                      {item.thumbnail ? (
                        <Image src={item.thumbnail} alt={item.title} fill className="object-contain p-1" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-5 w-5 text-slate-300" strokeWidth={1.5} aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">Qty {item.quantity}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-slate-900">{formatItemAmount(item)}</p>
                  </div>
                ))}

                {!order?.items?.length && (
                  <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Loading items…
                      </>
                    ) : (
                      "We'll load your items shortly."
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div
              className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center order-success-slide-up"
              style={{ animationDelay: "0.58s" }}
            >
              <Button
                onClick={() => router.push("/")}
                className="h-11 flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Continue shopping
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Button>
              <Button
                onClick={() => router.push("/account/orders")}
                variant="outline"
                className="h-11 flex-1 rounded-xl border-slate-200"
              >
                View my orders
              </Button>
            </div>

            {!isPaidOnline && !isCod && (
              <div className="flex justify-center order-success-slide-up" style={{ animationDelay: "0.64s" }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPolling(true)}
                  disabled={loading || polling}
                  className="text-slate-500 hover:text-slate-800"
                >
                  {polling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Confirming…
                    </>
                  ) : (
                    "Refresh payment status"
                  )}
                </Button>
              </div>
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
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden />
        </div>
      }
    >
      <OrderSuccessPageInner />
    </Suspense>
  );
}

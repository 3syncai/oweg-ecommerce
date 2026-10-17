"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { OrderConfirmation } from "@/components/orders/OrderConfirmation";
import Link from "next/link";
import { useCartSummary } from "@/contexts/CartProvider";

type OrderSummary = {
  id: string;
  display_id?: number | string;
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

function resolveOrderTotalRupees(order: OrderSummary | null): number | undefined {
  const total = order?.display_totals?.grandTotal ?? order?.total;
  return typeof total === "number" && total >= 0 ? total : undefined;
}

function OrderSuccessPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh: refreshCart } = useCartSummary();
  const orderId = params.get("orderId") || "";
  const isConfirmingFlow = params.get("confirming") === "1";
  const isCodCheckout = params.get("cod") === "1";
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [autoPollingStarted, setAutoPollingStarted] = useState(false);
  const [initialOrderChecked, setInitialOrderChecked] = useState(false);
  const [confirmFailed, setConfirmFailed] = useState(false);
  const [confirmFailReason, setConfirmFailReason] = useState<string | null>(null);
  const pollAttempts = useRef(0);
  const consecutiveNotFound = useRef(0);
  const clearedCartRef = useRef(false);
  const confirmStartedRef = useRef(false);
  const inFlightOrders = useRef(new Map<string, Promise<FetchOrderResult>>());
  const maxPollAttempts = 30;
  const maxConsecutiveNotFound = 5;
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

  type FetchOrderResult = { order: OrderSummary | null; notFound: boolean };

  async function fetchOrder(targetId: string = orderId): Promise<FetchOrderResult> {
    if (!targetId) return { order: null, notFound: false };
    const existing = inFlightOrders.current.get(targetId);
    if (existing) return existing;
    setLoading(true);
    const request = (async (): Promise<FetchOrderResult> => {
      try {
        const res = await fetch(`/api/checkout/order-summary?orderId=${encodeURIComponent(targetId)}`, { cache: "no-store" });
        if (res.status === 401) { setAuthRequired(true); setPolling(false); return { order: null, notFound: false }; }
        if (res.status === 404) return { order: null, notFound: true };
        if (!res.ok) return { order: null, notFound: false };
        const data = await res.json();
        return { order: data.order as OrderSummary, notFound: false };
      } catch (err) {
        console.error("fetchOrder error", err);
        return { order: null, notFound: false };
      } finally {
        inFlightOrders.current.delete(targetId);
        setLoading(inFlightOrders.current.size > 0);
      }
    })();
    inFlightOrders.current.set(targetId, request);
    return request;
  }

  function stopPollingWithFailure(reason: string) {
    setPolling(false);
    setConfirmFailed(true);
    setConfirmFailReason(reason);
  }

  useEffect(() => {
    setOrder(null);
    setAuthRequired(false);
    setInitialOrderChecked(false);
    setAutoPollingStarted(false);
    setPolling(false);
    setConfirmFailed(false);
    setConfirmFailReason(null);
    pollAttempts.current = 0;
    consecutiveNotFound.current = 0;
    confirmStartedRef.current = false;
  }, [orderId]);

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

  // Razorpay: await confirm (from session handoff) and replace URL with placed order id.
  useEffect(() => {
    if (!orderId || !isConfirmingFlow || isCodCheckout) return;
    if (confirmStartedRef.current) return;
    confirmStartedRef.current = true;
    let cancelled = false;

    (async () => {
      type PendingRzpConfirm = {
        medusaOrderId?: string;
        finalOrderId?: string;
        razorpay_payment_id?: string;
        razorpay_order_id?: string;
        razorpay_signature?: string;
        amount_minor?: number;
        currency?: string;
        at?: number;
      };
      let pending: PendingRzpConfirm | null = null;

      try {
        const raw = sessionStorage.getItem("oweg_pending_rzp_confirm");
        if (raw) pending = JSON.parse(raw) as PendingRzpConfirm;
      } catch {
        pending = null;
      }

      // Stale handoff (>15 min) — ignore payload but keep reconcile.
      if (pending?.at && Date.now() - pending.at > 15 * 60 * 1000) {
        pending = null;
        try {
          sessionStorage.removeItem("oweg_pending_rzp_confirm");
        } catch {
          /* ignore */
        }
      }

      try {
        if (pending?.finalOrderId && pending.finalOrderId !== orderId) {
          if (!cancelled) {
            try {
              sessionStorage.removeItem("oweg_pending_rzp_confirm");
            } catch {
              /* ignore */
            }
            router.replace(
              `/order/success?orderId=${encodeURIComponent(pending.finalOrderId)}&confirming=1`
            );
          }
          return;
        }

        if (
          pending?.medusaOrderId === orderId &&
          pending.razorpay_payment_id &&
          pending.razorpay_order_id &&
          pending.razorpay_signature
        ) {
          const confirmRes = await fetch("/api/checkout/razorpay/confirm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              medusaOrderId: pending.medusaOrderId,
              razorpay_payment_id: pending.razorpay_payment_id,
              razorpay_order_id: pending.razorpay_order_id,
              razorpay_signature: pending.razorpay_signature,
              amount_minor: pending.amount_minor,
              currency: pending.currency,
            }),
          });
          const confirmData = (await confirmRes.json().catch(() => ({}))) as {
            orderId?: string;
            medusaOrderId?: string;
            error?: string;
          };
          try {
            sessionStorage.removeItem("oweg_pending_rzp_confirm");
          } catch {
            /* ignore */
          }

          if (cancelled) return;

          if (confirmRes.status === 404 || confirmData.error === "order_not_found") {
            // Attempt recover before showing "no longer available" — dismiss race
            // may have tombstoned the draft while Razorpay already captured.
            try {
              const recoverRes = await fetch("/api/checkout/razorpay/recover", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  medusaOrderId: pending.medusaOrderId || orderId,
                  razorpay_payment_id: pending.razorpay_payment_id,
                  razorpay_order_id: pending.razorpay_order_id,
                  razorpay_signature: pending.razorpay_signature,
                  amount_minor: pending.amount_minor,
                  currency: pending.currency,
                }),
              });
              const recoverData = (await recoverRes.json().catch(() => ({}))) as {
                ok?: boolean;
                orderId?: string;
                error?: string;
              };
              if (!cancelled && recoverRes.ok && recoverData.ok && recoverData.orderId) {
                router.replace(
                  `/order/success?orderId=${encodeURIComponent(recoverData.orderId)}&confirming=1`
                );
                return;
              }
              if (!cancelled && recoverData.error === "orphan_capture") {
                stopPollingWithFailure(
                  "Payment was received but we could not attach it to an order automatically. Contact support with your payment reference — you will not be charged twice."
                );
                return;
              }
            } catch (recoverErr) {
              console.error("success recover failed", recoverErr);
            }
            if (!cancelled) {
              stopPollingWithFailure(
                "This order is no longer available. It may have been cancelled before payment finished confirming."
              );
            }
            return;
          }

          if (confirmRes.status === 502 && confirmData.error === "orphan_capture") {
            stopPollingWithFailure(
              "Payment was received but we could not attach it to an order automatically. Contact support with your payment reference — you will not be charged twice."
            );
            return;
          }

          const finalId = confirmData.orderId || confirmData.medusaOrderId || orderId;
          if (finalId && finalId !== orderId) {
            router.replace(`/order/success?orderId=${encodeURIComponent(finalId)}&confirming=1`);
            return;
          }
        } else {
          await fetch("/api/checkout/razorpay/reconcile", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ medusaOrderId: orderId }),
          });
        }

        if (!cancelled) {
          const { order: o, notFound } = await fetchOrder();
          if (o) setOrder(o);
          if (notFound) {
            consecutiveNotFound.current += 1;
          }
        }
      } catch (err) {
        console.error("razorpay confirm/reconcile failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, isConfirmingFlow, isCodCheckout, router]);


  useEffect(() => {
    if (!orderId) return;
    let mounted = true;
    (async () => {
      const { order: o, notFound } = await fetchOrder();
      if (!mounted) return;
      if (o) setOrder(o);
      if (notFound) consecutiveNotFound.current += 1;
      if (!o && !isConfirmingFlow) {
        stopPollingWithFailure(notFound
          ? "We couldn't find this order. Check My Orders or contact support with your order reference."
          : "We couldn't load your order details. Please check your connection and try checking the order status again.");
      }
      setInitialOrderChecked(true);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (!orderId || authRequired) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      pollAttempts.current += 1;
      const { order: latest, notFound } = await fetchOrder();
      if (cancelled) return;

      if (notFound) {
        consecutiveNotFound.current += 1;
      } else if (latest) {
        consecutiveNotFound.current = 0;
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
        if (isConfirmed) {
          setPolling(false);
          setConfirmFailed(false);
          return;
        }
      }

      if (
        consecutiveNotFound.current >= maxConsecutiveNotFound ||
        pollAttempts.current >= maxPollAttempts
      ) {
        stopPollingWithFailure(
          consecutiveNotFound.current >= maxConsecutiveNotFound
            ? "We couldn't find this order anymore. If you paid, check My Orders — your payment may still have gone through under a different reference."
            : "Confirmation is taking longer than expected. Check My Orders or contact support with your order reference."
        );
        return;
      }

      timer = setTimeout(() => {
        void tick();
      }, pollIntervalMs);
    }

    if (polling) {
      pollAttempts.current = 0;
      timer = setTimeout(() => { void tick(); }, pollIntervalMs);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, orderId, authRequired]);

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
  const isCodPending = isCod && codStatus !== "confirmed" && !confirmFailed;
  const isPaidOnline = rawPaymentStatus === "captured" || rawPaymentStatus === "paid";
  const isOrderComplete = !confirmFailed && (isPaidOnline || (isCod && codStatus === "confirmed" && !order?.is_draft_order));
  const isPaid = isOrderComplete;
  const statusMessage = confirmFailed
    ? confirmFailReason || "We couldn't confirm this order."
    : isCodPending
      ? "We're confirming your order. This usually takes a few seconds."
      : isCod
        ? "Your order is confirmed. Pay when your order arrives."
        : isPaidOnline
          ? "Your payment is confirmed. We'll share updates on your order."
          : rawPaymentStatus
            ? "We’re checking your payment with Razorpay. Your order details will update automatically."
            : "We’re checking your payment. Your order details will update automatically.";

  const orderMode =
    typeof order?.metadata?.mode === "string" ? (order.metadata.mode as string) : undefined;

  useEffect(() => {
    const shouldClear = isPaid;
    if (!shouldClear || clearedCartRef.current) return;
    if (orderMode === "buy_now") {
      clearedCartRef.current = true;
      if (typeof window !== "undefined") {
        const key = `oweg_checkout_item:${orderId}`;
        const purchased = sessionStorage.getItem(key);
        if (purchased && localStorage.getItem("buy_now_item") === purchased) localStorage.removeItem("buy_now_item");
        sessionStorage.removeItem(key);
      }
      return;
    }

    const clearCart = async () => {
      try {
        const guestCartId =
          typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null;
        const response = await fetch("/api/medusa/cart/clear", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
          },
          body: JSON.stringify({ orderId }),
        });
        const result = await response.json();
        if (response.ok && result.cleared) {
          if (localStorage.getItem("guest_cart_id") === result.clearedCartId) localStorage.removeItem("guest_cart_id");
          await refreshCart();
        }
      } catch (err) {
        console.warn("Failed to clear cart after order", err);
      } finally {
        clearedCartRef.current = true;
      }
    };

    void clearCart();
  }, [isPaid, orderMode, orderPaymentMethod, orderId, refreshCart]);

  useEffect(() => {
    if (!orderId || !isConfirmingFlow || isCodCheckout || confirmFailed || authRequired) return;
    if (!initialOrderChecked) return;
    if (isPaidOnline || polling || autoPollingStarted) return;
    setAutoPollingStarted(true);
    setPolling(true);
  }, [
    authRequired,
    autoPollingStarted,
    confirmFailed,
    initialOrderChecked,
    isCodCheckout,
    isConfirmingFlow,
    isPaidOnline,
    orderId,
    polling,
  ]);

  useEffect(() => {
    if (!orderId || !isConfirmingFlow || !isCodPending || confirmFailed || authRequired) return;
    if (!initialOrderChecked) return;
    if (polling || autoPollingStarted) return;
    setAutoPollingStarted(true);
    setPolling(true);
  }, [
    authRequired,
    autoPollingStarted,
    confirmFailed,
    initialOrderChecked,
    isCodPending,
    isConfirmingFlow,
    orderId,
    polling,
  ]);

  const totalRupees = resolveOrderTotalRupees(order);
  const coinsEarned = isPaid && totalRupees !== undefined ? Math.round(totalRupees * 0.01) : null;

  if (authRequired) return <div className="min-h-[75vh] bg-slate-50 px-4 py-10"><section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><h1 className="text-2xl font-semibold text-slate-900">Sign in to view your order</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your session has expired. Sign in with the account used at checkout to see your order and payment status.</p><p className="mt-3 text-sm text-slate-600">You do not need to make another payment.</p><Link className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oweg-green)] px-5 py-3 font-medium text-[var(--oweg-ink)]" href={`/login?redirect=${encodeURIComponent(`/order/success?${params.toString()}`)}`}>Sign in to view order</Link><p className="mt-5 break-all font-mono text-xs text-slate-500">Order reference: {orderId}</p></section></div>;

  return <OrderConfirmation
    order={order} orderId={orderId} complete={isOrderComplete} failed={confirmFailed || !orderId}
    cod={isCod} message={orderId ? statusMessage : "Open My Orders to find your purchases and their latest status."} total={totalRupees} coins={coinsEarned}
    loading={loading} polling={polling}
    onRefresh={() => {
      consecutiveNotFound.current = 0;
      setConfirmFailed(false);
      setPolling(true);
    }}
  />;
}

export default function OrderSuccessPage() {
  return <Suspense fallback={<div className="flex min-h-[75vh] items-center justify-center bg-slate-50" role="status"><Loader2 className="h-8 w-8 motion-safe:animate-spin text-[var(--oweg-green-dark)]" aria-hidden /><span className="sr-only">Loading your order</span></div>}><OrderSuccessPageInner /></Suspense>;
}

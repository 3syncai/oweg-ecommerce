"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { OrderConfirmation } from "@/components/orders/OrderConfirmation";
import Link from "next/link";
import { useCartSummary } from "@/contexts/CartProvider";
import { checkoutConfirmationState, confirmationPollDelay } from "@/lib/checkout-confirmation";
import { fetchCheckoutOrder, type CheckoutOrderFetchResult } from "@/lib/checkout-order-request";

type OrderSummary = {
  id: string;
  display_id?: number | string;
  status?: string;
  payment_status?: string;
  is_draft_order?: boolean;
  total?: number;
  display_totals?: { grandTotal?: number; itemsSubtotal?: number; shipping?: number; coinDiscount?: number; oweg10Discount?: number; promoDiscount?: number };
  currency_code?: string;
  items?: Array<{
    id: string;
    title: string;
    quantity: number;
    unit_price?: number;
    total: number;
    thumbnail?: string;
    variant_title?: string;
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
  const orderRequests = useRef(new Set<AbortController>());
  const requestGeneration = useRef(0);
  const maxPollAttempts = 30;

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

  type FetchOrderResult = CheckoutOrderFetchResult<OrderSummary>;

  async function fetchOrder(targetId: string = orderId, statusOnly = false): Promise<FetchOrderResult> {
    if (!targetId) return { order: null, notFound: false };
    const key = `${targetId}:${statusOnly ? "status" : "summary"}`;
    const existing = inFlightOrders.current.get(key);
    if (existing) return existing;
    setLoading(true);
    const controller = new AbortController();
    orderRequests.current.add(controller);
    const generation = requestGeneration.current;
    let request!: Promise<FetchOrderResult>;
    request = (async (): Promise<FetchOrderResult> => {
      try {
        const result = await fetchCheckoutOrder<OrderSummary>(targetId, statusOnly, controller);
        if (generation !== requestGeneration.current) return { order: null, notFound: false, cancelled: true };
        if (result.authRequired) { setAuthRequired(true); setPolling(false); }
        return result;
      } catch (err) {
        console.error("fetchOrder error", err);
        return { order: null, notFound: false };
      } finally {
        orderRequests.current.delete(controller);
        if (inFlightOrders.current.get(key) === request) inFlightOrders.current.delete(key);
        if (generation === requestGeneration.current) setLoading(inFlightOrders.current.size > 0);
      }
    })();
    inFlightOrders.current.set(key, request);
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
    clearedCartRef.current = false;
    const requests = orderRequests.current;
    const inFlight = inFlightOrders.current;
    return () => {
      requestGeneration.current += 1;
      for (const request of requests) request.abort();
      requests.clear();
      inFlight.clear();
    };
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
          const reconcileRes = await fetch("/api/checkout/razorpay/reconcile", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ medusaOrderId: orderId }),
          });
          const reconciled = await reconcileRes.json().catch(() => ({})) as { orderId?: string; medusaOrderId?: string };
          const finalId = reconciled.orderId || reconciled.medusaOrderId;
          if (!cancelled && reconcileRes.ok && finalId && finalId !== orderId) {
            router.replace(`/order/success?orderId=${encodeURIComponent(finalId)}&confirming=1`);
            return;
          }
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
      const { order: o, notFound, cancelled, authRequired: needsAuth } = await fetchOrder();
      if (!mounted || cancelled || needsAuth) return;
      if (o) setOrder(o);
      if (notFound) consecutiveNotFound.current += 1;
      if (!o && !notFound) {
        setAutoPollingStarted(true);
        setPolling(true);
      }
      if (!o && notFound && !isConfirmingFlow) {
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
      if (document.visibilityState === "hidden") {
        timer = setTimeout(() => { void tick(); }, 10000);
        return;
      }
      pollAttempts.current += 1;
      const { order: latest, notFound } = await fetchOrder(orderId, true);
      if (cancelled) return;

      if (notFound) {
        consecutiveNotFound.current += 1;
      } else if (latest) {
        consecutiveNotFound.current = 0;
        const state = checkoutConfirmationState(latest);
        setOrder(previous => ({ ...previous, ...latest, metadata: { ...previous?.metadata, ...latest.metadata } }));
        if (state.complete || state.cancelled) {
          setPolling(false);
          setConfirmFailed(false);
          const details = await fetchOrder();
          if (!cancelled && details.order) setOrder(details.order);
          return;
        }
      }

      if (
        pollAttempts.current >= maxPollAttempts
      ) {
        stopPollingWithFailure(
          consecutiveNotFound.current > 0
            ? "We couldn't find this order anymore. If you paid, check My Orders — your payment may still have gone through under a different reference."
            : "Confirmation is taking longer than expected. Check My Orders or contact support with your order reference."
        );
        return;
      }

      timer = setTimeout(() => {
        void tick();
      }, confirmationPollDelay(pollAttempts.current));
    }

    if (polling) {
      pollAttempts.current = 0;
      timer = setTimeout(() => { void tick(); }, confirmationPollDelay(0));
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
  const confirmation = checkoutConfirmationState(order);
  const isCod = confirmation.cod || (!order && isCodCheckout);
  const codStatus =
    typeof order?.metadata?.cod_status === "string" ? order.metadata.cod_status : undefined;
  const isCodPending = isCod && codStatus !== "confirmed" && !confirmFailed;
  const isPaidOnline = confirmation.paid;
  const isOrderComplete = confirmation.complete;
  const isPaid = isOrderComplete;
  const statusMessage = confirmation.cancelled ? "This order was cancelled. Check its details for the latest payment or refund status."
    : confirmFailed && !isOrderComplete
    ? confirmFailReason || "We couldn't confirm this order."
    : isCodPending
      ? "We're confirming your order. This usually takes a few seconds."
      : isCod
        ? "Your order is confirmed. Pay when your order arrives."
        : isPaidOnline && !isOrderComplete
          ? "Payment received. We’re finishing your order confirmation; please don’t pay again."
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
    if (!orderId || isCod || confirmFailed || authRequired || confirmation.cancelled) return;
    if (!initialOrderChecked) return;
    if (isOrderComplete || polling || autoPollingStarted) return;
    setAutoPollingStarted(true);
    setPolling(true);
  }, [
    authRequired,
    autoPollingStarted,
    confirmFailed,
    initialOrderChecked,
    isCod,
    confirmation.cancelled,
    isConfirmingFlow,
    isOrderComplete,
    orderId,
    polling,
  ]);

  useEffect(() => {
    if (!orderId || !isCodPending || isOrderComplete || confirmation.cancelled || confirmFailed || authRequired) return;
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
    isOrderComplete,
    confirmation.cancelled,
    isConfirmingFlow,
    orderId,
    polling,
  ]);

  const totalRupees = resolveOrderTotalRupees(order);
  // Do not invent wallet rewards from the order total; the ledger owns eligibility.
  const coinsEarned = null;

  if (authRequired) return <div className="min-h-[75vh] bg-slate-50 px-4 py-10"><section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><h1 className="text-2xl font-semibold text-slate-900">Sign in to view your order</h1><p className="mt-3 text-sm leading-6 text-slate-600">Your session has expired. Sign in with the account used at checkout to see your order and payment status.</p><p className="mt-3 text-sm text-slate-600">You do not need to make another payment.</p><Link className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oweg-green)] px-5 py-3 font-medium text-[var(--oweg-ink)]" href={`/login?redirect=${encodeURIComponent(`/order/success?${params.toString()}`)}`}>Sign in to view order</Link><p className="mt-5 break-all font-mono text-xs text-slate-500">Order reference: {orderId}</p></section></div>;

  return <OrderConfirmation
    order={order} orderId={orderId} complete={isOrderComplete} failed={(!isOrderComplete && confirmFailed) || confirmation.cancelled || !orderId}
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { openRazorpayCheckout } from "@/lib/razorpay-client";

type Choice = {
  variant_id: string;
  vendor_id: string;
  store_name: string;
  product_title: string;
  variant_title: string;
  sku: string;
  unit_price: number;
  options: Record<string, string>;
};

type Request = {
  id: string;
  status: string;
  original_title: string;
  original_unit_price: number;
  message?: string | null;
  options: Choice[];
  selected_variant_id?: string | null;
  adjustment_amount?: number | null;
};

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(value);

export default function OrderReplacementChoices({ orderId, onOrderChanged }: {
  orderId: string;
  onOrderChanged: () => void;
}) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/medusa/orders/${encodeURIComponent(orderId)}/replacement-requests`, {
        credentials: "include", cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      setRequests(json.requests || []);
    } catch {
      // Keep the order page usable when the request service is temporarily unavailable.
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const respond = async (requestId: string, decision: "accept" | "reject") => {
    const variantId = selected[requestId];
    if (decision === "accept" && !variantId) return;
    setBusy(requestId);
    setError("");
    try {
      const res = await fetch(`/api/medusa/orders/${encodeURIComponent(orderId)}/replacement-requests`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, decision, variant_id: variantId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Could not save your choice");
      await load();
      onOrderChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your choice");
    } finally {
      setBusy(null);
    }
  };

  const payDifference = async (requestId: string) => {
    setBusy(requestId);
    setError("");
    try {
      const response = await fetch(`/api/medusa/orders/${encodeURIComponent(orderId)}/replacement-requests`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payment_order", request_id: requestId }),
      });
      const paymentOrder = await response.json();
      if (!response.ok) throw new Error(paymentOrder.message || "Could not start payment");
      await openRazorpayCheckout({
        key: paymentOrder.key_id, amountMinor: paymentOrder.amount_minor, currency: "INR",
        orderId: paymentOrder.order_id, description: "Order replacement price difference",
        onSuccess: async (payment) => {
          try {
            const verified = await fetch(`/api/medusa/orders/${encodeURIComponent(orderId)}/replacement-requests`, {
              method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "verify_payment", request_id: requestId, ...payment }),
            });
            const result = await verified.json().catch(() => ({}));
            if (!verified.ok) throw new Error(result.message || "Payment was received, but assignment needs support review");
            await load();
            onOrderChanged();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Payment needs support review");
          } finally { setBusy(null); }
        },
        onDismiss: () => setBusy(null),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start payment");
      setBusy(null);
    }
  };

  if (!requests.length) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm" aria-labelledby="replacement-title">
      <div className="border-b border-amber-100 bg-amber-50 px-4 py-4 sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Action for your order</p>
        <h2 id="replacement-title" className="mt-1 text-lg font-semibold text-slate-900">Choose an available replacement</h2>
        <p className="mt-1 text-sm text-slate-600">Review the current choices and tell us what you prefer.</p>
      </div>
      <div className="space-y-5 p-4 sm:p-5">
        {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        {requests.map((request) => (
          <div key={request.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{request.original_title}</p>
                <p className="mt-0.5 text-xs text-slate-500">Original item price: {money(request.original_unit_price)}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
                {request.status.replace(/_/g, " ")}
              </span>
            </div>
            {request.message ? <p className="mt-3 text-sm text-slate-600">{request.message}</p> : null}
            {request.status === "pending" ? (
              <>
                <div className="mt-4 space-y-2" role="radiogroup" aria-label="Replacement choices">
                  {request.options.map((choice) => {
                    const attributes = Object.entries(choice.options || {}).map(([name, value]) => `${name}: ${value}`).join(" · ");
                    const active = selected[request.id] === choice.variant_id;
                    return (
                      <button key={choice.variant_id} type="button" role="radio" aria-checked={active}
                        onClick={() => setSelected((current) => ({ ...current, [request.id]: choice.variant_id }))}
                        className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-green-600 ${active ? "border-green-600 bg-green-50" : "border-slate-200 hover:border-green-300"}`}>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">{choice.product_title}</span>
                          <span className="mt-1 block text-xs text-slate-600">{attributes || choice.variant_title}</span>
                          <span className="mt-1 block text-xs text-slate-500">Sold by {choice.store_name}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-slate-900">{money(choice.unit_price)}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-slate-500">A different price may require a payment adjustment before the item can be reassigned.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={!selected[request.id] || busy === request.id}
                    onClick={() => void respond(request.id, "accept")}
                    className="rounded-lg bg-[#326b29] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {busy === request.id ? "Saving…" : "Agree to selected choice"}
                  </button>
                  <button type="button" disabled={busy === request.id}
                    onClick={() => void respond(request.id, "reject")}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
                    None of these work
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                {request.status === "applied" ? "Your chosen item has been assigned to the new vendor."
                  : request.status === "awaiting_payment" ? `You accepted the replacement. Pay ${money(request.adjustment_amount || 0)} to assign it to the new vendor.`
                    : request.status === "awaiting_refund" || request.status === "settling_refund" ? `Your ${money(Math.abs(request.adjustment_amount || 0))} refund is being arranged before reassignment.`
                      : request.status === "settlement_failed" ? "The payment adjustment was recorded, but assignment needs support review. Please contact us."
                    : request.status === "rejected" ? "You declined these alternatives. OWEG support can help with another option."
                      : "OWEG is reviewing this request."}
              </p>
            )}
            {request.status === "awaiting_payment" ? (
              <button type="button" disabled={busy === request.id} onClick={() => void payDifference(request.id)}
                className="mt-3 rounded-lg bg-[#326b29] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy === request.id ? "Processing…" : `Pay ${money(request.adjustment_amount || 0)}`}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

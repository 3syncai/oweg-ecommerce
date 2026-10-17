"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock3, Loader2, MapPin, Package, ShieldCheck, ShoppingBag, Sparkles, TriangleAlert } from "lucide-react";
import { formatOrderCurrency } from "@/lib/order-utils";

export type ConfirmationOrder = {
  id: string;
  display_id?: number | string;
  currency_code?: string;
  items?: { id: string; title: string; quantity: number; total: number; thumbnail?: string }[];
  shipping_address?: Record<string, unknown>;
};

function ProductPhoto({ src, title }: { src?: string; title: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  return <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
    {src && failedSource !== src ? (
      // Native loading avoids an extra image-optimizer round trip for the small confirmation thumbnail.
      // eslint-disable-next-line @next/next/no-img-element
      <img ref={image => { if (image?.complete && !image.naturalWidth) setFailedSource(src); }} src={src} alt={title} width={80} height={80} loading="lazy" decoding="async" onError={() => setFailedSource(src)} className="h-full w-full object-contain p-2" />
    ) : <Package className="h-7 w-7 text-slate-300" aria-hidden />}
  </div>;
}

export function OrderConfirmation({ order, orderId, complete, failed, cod, message, total, coins, loading, polling, onRefresh }: {
  order: ConfirmationOrder | null;
  orderId: string;
  complete: boolean;
  failed: boolean;
  cod: boolean;
  message: string;
  total?: number;
  coins: number | null;
  loading: boolean;
  polling: boolean;
  onRefresh: () => void;
}) {
  const address = order?.shipping_address;
  const text = (key: string) => typeof address?.[key] === "string" ? String(address[key]).trim() : "";
  const name = [text("first_name"), text("last_name")].filter(Boolean).join(" ");
  const addressLines = [text("address_1"), text("address_2"), [text("city"), text("province"), text("postal_code")].filter(Boolean).join(", ")].filter(Boolean);
  const amount = total === undefined ? "—" : formatOrderCurrency(total, order?.currency_code);
  const itemCount = order?.items?.reduce((sum, item) => sum + item.quantity, 0);
  const label = failed ? "Confirmation delayed" : complete ? "Order confirmed" : "Confirming your order";
  const Icon = failed ? TriangleAlert : complete ? Check : Loader2;
  return (
    <div className="min-h-[75vh] bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 sm:py-10 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-col gap-4 sm:mb-9 sm:flex-row sm:items-center sm:gap-5" role="status" aria-live="polite">
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${failed ? "bg-amber-100 text-amber-700" : complete ? "bg-[var(--oweg-green)] text-[var(--oweg-ink)] shadow-lg shadow-[var(--oweg-surface-tint)]" : "bg-[var(--oweg-surface-tint)] text-[var(--oweg-ink)]"}`}>
            <Icon className={`h-8 w-8 ${!failed && !complete ? "motion-safe:animate-spin" : ""}`} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className={`mb-1 text-xs font-semibold uppercase tracking-[0.16em] ${failed ? "text-amber-700" : "text-[var(--oweg-ink-soft)]"}`}>{label}</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{failed ? "Let’s check your order" : complete ? "Thank you for your order!" : "Just a moment…"}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{message}</p>
          </div>
        </div>

        {!orderId && <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No order reference was provided. Open My Orders to find your purchases.</div>}
        {failed && orderId && <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">If money was debited, check My Orders or contact support with the reference below before trying another payment.</div>}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:gap-7">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="confirmation-items">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
              <div>
                <h2 id="confirmation-items" className="text-lg font-semibold">{order?.display_id ? `Order #${order.display_id}` : "Your order"}</h2>
                <p className="mt-1 text-sm text-slate-500">{itemCount === undefined ? "Order details will appear here" : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${complete ? "bg-[var(--oweg-surface-tint)] text-[var(--oweg-ink-soft)]" : "bg-amber-50 text-amber-800"}`}>
                {complete ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Clock3 className="h-3.5 w-3.5" aria-hidden />}
                {failed ? "Needs attention" : complete ? cod ? "Cash on delivery" : "Payment successful" : "Processing"}
              </span>
            </div>
            <div className="divide-y divide-slate-100 px-5 sm:px-7" aria-busy={!order && loading}>
              {order?.items?.map(item => <div key={item.id} className="flex items-center gap-3 py-5 sm:gap-4">
                <ProductPhoto src={item.thumbnail} title={item.title} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium leading-6 sm:text-base">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500">Quantity: {item.quantity}</p>
                  <p className="mt-1 text-sm font-semibold sm:hidden">{formatOrderCurrency(item.total, order?.currency_code)}</p>
                </div>
                <p className="hidden shrink-0 text-sm font-semibold sm:block">{formatOrderCurrency(item.total, order?.currency_code)}</p>
              </div>)}
              {!order?.items?.length && (loading || !order && !failed && !!orderId ? <div className="space-y-5 py-6" aria-label="Loading order details">{[0, 1].map(i => <div key={i} className="flex gap-4 motion-safe:animate-pulse"><div className="h-20 w-20 rounded-xl bg-slate-100" /><div className="flex-1 space-y-3 py-3"><div className="h-4 w-3/4 rounded bg-slate-100" /><div className="h-3 w-1/3 rounded bg-slate-100" /></div></div>)}</div> : <p className="py-8 text-sm text-slate-500">Order details are currently unavailable. You can check My Orders for updates.</p>)}
            </div>
            {orderId && <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-7"><p className="text-xs text-slate-500">Order reference</p><p className="mt-1 break-all font-mono text-xs leading-5 text-slate-600">{orderId}</p></div>}
          </section>

          <div className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="payment-summary">
              <h2 id="payment-summary" className="text-lg font-semibold">Payment summary</h2>
              <div className="mt-5 flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">Payment</span><span className="text-right font-medium">{cod ? "Cash on delivery" : complete ? "Paid online" : failed ? "To be verified" : "Awaiting confirmation"}</span></div>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-5"><span className="text-sm font-medium">{cod ? "Amount to pay" : complete ? "Total paid" : "Order total"}</span><span className="text-2xl font-semibold tracking-tight">{amount}</span></div>
              {cod && <p className="mt-2 text-xs leading-5 text-slate-500">Pay when your order arrives.</p>}
              <Link href="/account/orders" className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--oweg-green)] px-4 text-sm font-semibold text-[var(--oweg-ink)] transition-colors hover:bg-[var(--oweg-green-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oweg-green-dark)]">View my orders <ArrowRight className="h-4 w-4" aria-hidden /></Link>
              <Link href="/" className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium transition-colors hover:border-[var(--oweg-green)] hover:bg-[var(--oweg-surface-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oweg-green-dark)]"><ShoppingBag className="h-4 w-4" aria-hidden /> Continue shopping</Link>
              {!complete && orderId && <button type="button" onClick={onRefresh} disabled={loading || polling} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-sm font-medium text-[var(--oweg-ink-soft)] disabled:text-slate-500">{polling || loading ? <><Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> Checking order…</> : "Check order status"}</button>}
            </section>
            {!!addressLines.length && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="delivery-address"><h2 id="delivery-address" className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-[var(--oweg-green-dark)]" aria-hidden /> Delivery address</h2><address className="mt-3 break-words text-sm not-italic leading-6 text-slate-600">{name && <p className="font-medium text-slate-900">{name}</p>}{addressLines.map((line, index) => <p key={index}>{line}</p>)}</address></section>}
            {complete && coins !== null && coins > 0 && <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden /><div><p className="text-sm font-semibold text-amber-950">Estimated reward: {coins.toFixed(0)} OWEG coins</p><p className="mt-1 text-xs leading-5 text-amber-800">Credited after eligible delivery · 1 coin = ₹1 off a future order, within redemption limits</p></div></div>}
          </div>
        </div>
        <p className="mt-7 flex items-center justify-center gap-2 text-center text-xs leading-5 text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden /> Track your order and delivery updates in My Orders.</p>
      </div>
    </div>
  );
}

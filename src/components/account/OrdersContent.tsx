"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, CheckCircle2, ChevronDown, Clock3, Headphones, Loader2, Package, RefreshCw, RotateCcw, Search, ShoppingBag, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AccountLoginPrompt from "@/components/account/AccountLoginPrompt";
import {
  type AccountOrder,
  type AccountOrderBucket,
  resolveOrderBucket,
  resolveOrderStatusLabel,
  useAccountOrdersSummary,
} from "@/hooks/useAccountOrdersSummary";
import { useAddToCart } from "@/hooks/useCartMutations";
import { getOrderCardActions } from "@/lib/order-actions";
import { buildOrderHref, buildOrderItemProductHref, buildTrackHref, resolveOrderLineItemsForCart } from "@/lib/order-utils";
import { formatAccountCurrency, formatAccountDate } from "@/lib/account-utils";
import { useAuth } from "@/contexts/AuthProvider";
import { cn } from "@/lib/utils";

type OrdersContentProps = {
  embedded?: boolean;
};

type StatusFilter = "all" | AccountOrderBucket;

const STATUS_TABS: Array<{
  key: StatusFilter;
  label: string;
}> = [
  { key: "all", label: "All orders" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "returns", label: "Returns" },
  { key: "canceled", label: "Canceled" },
];

const STATUS_STYLE = {
  processing: { className: "bg-amber-50 text-amber-800 ring-amber-200/70", icon: Clock3 },
  shipped: { className: "bg-sky-50 text-sky-800 ring-sky-200/70", icon: Truck },
  delivered: { className: "bg-green-50 text-green-800 ring-green-200/70", icon: CheckCircle2 },
  returns: { className: "bg-orange-50 text-orange-800 ring-orange-200/70", icon: RotateCcw },
  canceled: { className: "bg-rose-50 text-rose-700 ring-rose-200/70", icon: XCircle },
};

function resolveVariantId(order: AccountOrder): string | null {
  return resolveOrderLineItemsForCart(order)[0]?.variant_id ?? null;
}

function orderMatchesSearch(order: AccountOrder, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const idMatch =
    order.id.toLowerCase().includes(normalized) ||
    (order.display_id != null && String(order.display_id).includes(normalized));
  if (idMatch) return true;
  return (order.items || []).some((item) =>
    (item.title || "").toLowerCase().includes(normalized)
  );
}

function isWithinLastSixMonths(createdAt?: string): boolean {
  if (!createdAt) return true;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return true;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  return created >= cutoff;
}

function OrdersSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1].map(index => (
        <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4 motion-safe:animate-pulse sm:p-5">
          <div className="mb-4 h-4 w-28 rounded bg-slate-100" />
          <div className="flex items-center gap-4">
            <div className="size-14 shrink-0 rounded-xl bg-slate-100" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-3/4 rounded bg-slate-100" />
              <div className="h-3 w-1/3 rounded bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderCard({
  order,
}: {
  order: AccountOrder;
}) {
  const addToCart = useAddToCart();
  const [imageFailed, setImageFailed] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const bucket = resolveOrderBucket(order);
  const statusLabel = resolveOrderStatusLabel(order);
  const firstItem = order.items?.[0];
  const productHref = buildOrderItemProductHref(firstItem);
  const imageSrc = firstItem?.thumbnail || "/oweg_logo.png";
  const variantId = resolveVariantId(order);
  const orderLabel = order.display_id == null ? null : `#${order.display_id}`;
  const detailHref = buildOrderHref(order.id, order.display_id);
  const trackHref = buildTrackHref(order.id, order.display_id);
  const cardActions = getOrderCardActions(order);
  const StatusIcon = STATUS_STYLE[bucket].icon;
  const trackFirst = cardActions.showTrack && (bucket === "processing" || bucket === "shipped");
  const buyAgain = cardActions.showBuyAgain && Boolean(variantId);
  const moreActions = cardActions.showTrack || cardActions.showCancel || cardActions.showReturn || buyAgain;
  const actionHref = (action: "cancel" | "return") => detailHref + (detailHref.includes("?") ? "&" : "?") + "action=" + action;
  const secondaryAction = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-green-600 disabled:opacity-60";

  useEffect(() => {
    if (!actionsOpen) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !actionsRef.current?.contains(event.target)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [actionsOpen]);

  const handleBuyAgain = async () => {
    if (!variantId) return;
    try {
      await addToCart.mutateAsync({ variant_id: variantId, quantity: 1 });
      toast.success("Added to cart");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add to cart";
      toast.error(message);
    }
  };

  const productSummary = (
    <>
      <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 sm:size-[88px]">
        {imageFailed ? (
          <Package className="size-8 text-slate-300" aria-hidden />
        ) : (
          <Image src={imageSrc} alt="" fill className="object-contain p-2" sizes="88px" onError={() => setImageFailed(true)} />
        )}
      </div>
      <h2 className="line-clamp-2 min-w-0 break-words text-sm font-semibold leading-relaxed text-slate-900 group-hover:text-[#145448] group-hover:underline">
        {firstItem?.title || (orderLabel ? `Order ${orderLabel}` : "Order details")}
      </h2>
    </>
  );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-t-2xl border-b border-slate-100 bg-slate-50/70 px-4 py-3.5 sm:grid-cols-[1fr_1fr_auto] sm:px-5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Order placed</p>
          <p className="mt-1 text-xs font-medium text-slate-700">{formatAccountDate(order.created_at)}</p>
        </div>
        <div className="text-right sm:text-left">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Order total</p>
          <p className="mt-1 text-xs font-semibold tabular-nums text-slate-900">{formatAccountCurrency(order.total, order.currency_code)}</p>
        </div>
        {orderLabel && <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:block sm:text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Order number</p>
          <p className="text-xs font-semibold text-slate-700 sm:mt-1">{orderLabel}</p>
        </div>}
      </div>

      <div className="px-4 py-4 sm:px-5">
        {productHref ? (
          <Link href={productHref} prefetch={false} className="group flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 sm:gap-4">
            {productSummary}
          </Link>
        ) : (
          <div className="flex items-center gap-3 sm:gap-4">{productSummary}</div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset", STATUS_STYLE[bucket].className)}>
              <StatusIcon className="h-3.5 w-3.5" aria-hidden />
              {statusLabel}
            </span>
          {(order.items?.length || 0) > 1 ? (
            <p className="text-xs text-slate-500">
              +{(order.items?.length || 0) - 1} more item
              {(order.items?.length || 0) - 1 > 1 ? "s" : ""}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
        <Link href={trackFirst ? trackHref : detailHref} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#145448] px-3 py-2 text-sm font-semibold text-white hover:bg-[#103e36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600">
          <AccountHubIcon name={trackFirst ? "track-order" : "view-details"} size={16} className="size-4" />
          {trackFirst ? "Track order" : "View order details"}
        </Link>
        {moreActions && (
          <div ref={actionsRef} className="relative ml-auto min-w-0" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setActionsOpen(false);
          }} onKeyDown={(event) => {
            if (event.key === "Escape" && actionsOpen) {
              event.stopPropagation();
              setActionsOpen(false);
              actionsButtonRef.current?.focus();
            }
          }}>
            <button type="button" ref={actionsButtonRef} aria-expanded={actionsOpen} onClick={() => setActionsOpen(open => !open)} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2">
              More actions <ChevronDown className={cn("size-4 shrink-0", actionsOpen && "rotate-180")} aria-hidden />
            </button>
            {actionsOpen && <div className="absolute right-0 top-full z-20 mt-2 grid w-48 gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              {trackFirst && cardActions.showViewDetails && <Link href={detailHref} className={secondaryAction} onClick={() => setActionsOpen(false)}><Package className="size-4" aria-hidden /> View order details</Link>}
              {!trackFirst && cardActions.showTrack && <Link href={trackHref} className={secondaryAction} onClick={() => setActionsOpen(false)}><Truck className="size-4" aria-hidden /> Track order</Link>}
              {cardActions.showCancel && <Link href={actionHref("cancel")} className={secondaryAction} onClick={() => setActionsOpen(false)}><XCircle className="size-4" aria-hidden /> Cancel order</Link>}
              {cardActions.showReturn && <Link href={actionHref("return")} className={secondaryAction} onClick={() => setActionsOpen(false)}><RotateCcw className="size-4" aria-hidden /> Return / Replace</Link>}
              {buyAgain && (
                <button type="button" className={secondaryAction} disabled={addToCart.isPending} aria-busy={addToCart.isPending || undefined} onClick={() => void handleBuyAgain()}>
                  {addToCart.isPending ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <ShoppingBag className="size-4" aria-hidden />}
                  {addToCart.isPending ? "Adding…" : "Buy again"}
                </button>
              )}
            </div>}
          </div>
        )}
      </div>
    </article>
  );
}

export default function OrdersContent({ embedded = false }: OrdersContentProps) {
  const { customer } = useAuth();
  const [listPage, setListPage] = useState(1);
  const { orders, loading, refreshing, error, refresh, totalPages, page, hasMore } =
    useAccountOrdersSummary({ page: listPage, pageSize: 15 });
  const pullStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressRefreshClick = useRef(false);
  const [releaseToRefresh, setReleaseToRefresh] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [activeStat, setActiveStat] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastSixMonthsOnly, setLastSixMonthsOnly] = useState(false);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const bucket = resolveOrderBucket(order);
        if (activeStat !== "all" && bucket !== activeStat) return false;
        if (lastSixMonthsOnly && !isWithinLastSixMonths(order.created_at)) return false;
        return orderMatchesSearch(order, searchQuery);
      })
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
  }, [orders, activeStat, lastSixMonthsOnly, searchQuery]);

  const showSkeleton = loading && orders.length === 0;
  const canRefresh = !loading && !refreshing;
  const refreshOrders = () => {
    if (!canRefresh) return;
    setRefreshMessage("");
    void refresh({ cancelRefetch: false }).then(result => {
      if (result.isSuccess) setRefreshMessage("Orders updated");
    });
  };

  if (!customer) {
    return (
      <AccountLoginPrompt
        redirect={embedded ? "/account/orders" : "/orders"}
        title="Sign in to view your orders"
        description="Please log in to check order status, tracking, and delivery updates."
      />
    );
  }

  const wrapperClass = embedded ? "space-y-6" : "mx-auto max-w-5xl space-y-6 px-4 py-10";

  return (
    <div className={wrapperClass}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#326b29]">Your purchases</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Your orders</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">Track deliveries, view details, and manage your purchases.</p>
        </div>
        <Link href="/account/help" className="mt-1 inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:border-green-200 hover:text-green-800">
          <Headphones className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Need help?</span>
          <span className="sr-only sm:hidden">Help with your orders</span>
        </Link>
      </header>

      <section aria-label="Order filters" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 p-3 sm:p-4">
          <div className="relative col-span-2 min-w-0 sm:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search orders"
              aria-label="Search by order ID or product"
              className="h-11 rounded-lg border-slate-200 bg-slate-50/50 pl-9 text-sm shadow-none placeholder:text-slate-400 focus-visible:ring-green-600/20"
            />
          </div>

          <details className="group row-start-2 min-w-0">
            <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
              Filters{activeStat !== "all" || lastSixMonthsOnly ? " (" + (Number(activeStat !== "all") + Number(lastSixMonthsOnly)) + ")" : ""}
              <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <Select value={activeStat} onValueChange={(value: StatusFilter) => setActiveStat(value)}>
                <SelectTrigger aria-label="Filter by order status" className="min-w-0 rounded-lg border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_TABS.map(status => <SelectItem key={status.key} value={status.key}>{status.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={lastSixMonthsOnly ? "6months" : "all-time"} onValueChange={value => setLastSixMonthsOnly(value === "6months")}>
                <SelectTrigger aria-label="Filter by order date" className="min-w-0 rounded-lg border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-time">All time</SelectItem>
                  <SelectItem value="6months">Last 6 months</SelectItem>
                </SelectContent>
              </Select>
              {(activeStat !== "all" || lastSixMonthsOnly) && (
                <button type="button" className="min-h-11 px-2 text-sm font-medium text-[#145448] underline" onClick={() => { setActiveStat("all"); setLastSixMonthsOnly(false); }}>Clear filters</button>
              )}
            </div>
          </details>
          <button
            type="button"
            onClick={event => {
              if (event.detail === 0 || !suppressRefreshClick.current) refreshOrders();
              suppressRefreshClick.current = false;
            }}
            onPointerDown={event => {
              if (!event.isPrimary) return;
              suppressRefreshClick.current = false;
              if (event.pointerType !== "touch" || !window.matchMedia("(max-width: 639px)").matches) return;
              pullStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            }}
            onPointerMove={event => {
              const start = pullStart.current;
              if (start?.id !== event.pointerId) return;
              const distance = event.clientY - start.y;
              setReleaseToRefresh(distance >= 48 && distance > Math.abs(event.clientX - start.x));
            }}
            onPointerUp={event => {
              const start = pullStart.current;
              if (start?.id !== event.pointerId) return;
              pullStart.current = null;
              setReleaseToRefresh(false);
              const x = Math.abs(event.clientX - start.x);
              const y = event.clientY - start.y;
              suppressRefreshClick.current = Math.max(x, Math.abs(y)) > 10;
              if (y >= 48 && y > x) refreshOrders();
            }}
            onPointerCancel={() => {
              pullStart.current = null;
              setReleaseToRefresh(false);
            }}
            disabled={!canRefresh}
            aria-busy={refreshing || undefined}
            aria-label="Refresh orders"
            title="Refresh orders"
            className="col-start-2 row-start-2 inline-flex min-h-11 touch-pan-x touch-pinch-zoom select-none items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-green-800 disabled:opacity-50 sm:row-start-1 sm:touch-auto"
          >
            {releaseToRefresh ? <ArrowDown className="h-4 w-4" aria-hidden /> : <RefreshCw className={cn("h-4 w-4", refreshing && "motion-safe:animate-spin")} aria-hidden />}
            <span className="sm:sr-only">{refreshing ? "Refreshing…" : releaseToRefresh ? "Release to refresh" : "Pull or tap to refresh"}</span>
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 px-0.5 text-xs text-slate-500" aria-live="polite">
        <p>
          {showSkeleton ? "Loading your orders…" : <><span className="font-semibold text-slate-700">{filteredOrders.length}</span> {filteredOrders.length === 1 ? "order" : "orders"} on this page</>}
        </p>
        {refreshing ? (
          <span>Updating orders…</span>
        ) : <span>{refreshMessage || "Most recent first"}</span>}
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          <p>We couldn’t load the latest orders.</p>
          <button type="button" disabled={!canRefresh} onClick={refreshOrders} className="mt-1 min-h-11 underline disabled:opacity-50">Try again</button>
        </div>
      ) : null}

      {showSkeleton ? (
        <OrdersSkeleton />
      ) : error && orders.length === 0 ? null : (
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-[#326b29]"><ShoppingBag className="h-6 w-6" aria-hidden /></div>
              <p className="text-base font-semibold text-slate-900">
                {orders.length === 0 ? "You have no orders yet." : "No orders match your filters."}
              </p>
              <p className="mt-2 text-sm text-slate-500">{orders.length === 0 ? "When you place an order, you can follow its journey here." : "Try a different search, status, or date range."}</p>
              {orders.length === 0 ? (
                <Link
                  href="/"
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-[#326b29] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285722]"
                >
                  Continue shopping
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          ) : (
            filteredOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))
          )}
          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setListPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={!hasMore || loading}
                onClick={() => setListPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

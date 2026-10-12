"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, Headphones, Loader2, Package, RefreshCw, RotateCcw, Search, ShoppingBag, Truck, XCircle } from "lucide-react";
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
import { buildOrderHref, buildTrackHref, resolveOrderLineItemsForCart } from "@/lib/order-utils";
import { formatAccountCurrency, formatAccountDate } from "@/lib/account-utils";
import { useAuth } from "@/contexts/AuthProvider";
import { cn } from "@/lib/utils";

type OrdersContentProps = {
  embedded?: boolean;
};

type StatusFilter = "all" | AccountOrderBucket;
type DropdownStatusFilter = "all" | AccountOrderBucket;

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
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`order-skeleton-${index}`}
          className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white"
        >
          <div className="flex justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4">
            <div className="h-8 w-24 rounded bg-slate-100" />
            <div className="h-8 w-24 rounded bg-slate-100" />
            <div className="h-8 w-20 rounded bg-slate-100" />
          </div>
          <div className="flex gap-5 p-5">
            <div className="h-20 w-20 rounded-xl bg-slate-100" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-2/3 rounded bg-slate-100" />
              <div className="h-5 w-32 rounded bg-slate-100" />
              <div className="h-3 w-24 rounded bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderCard({
  order,
  index,
}: {
  order: AccountOrder;
  index: number;
}) {
  const addToCart = useAddToCart();
  const [imageFailed, setImageFailed] = useState(false);
  const bucket = resolveOrderBucket(order);
  const statusLabel = resolveOrderStatusLabel(order);
  const firstItem = order.items?.[0];
  const imageSrc = firstItem?.thumbnail || "/oweg_logo.png";
  const variantId = resolveVariantId(order);
  const orderLabel =
    order.display_id != null ? `#${order.display_id}` : `#${index + 1}`;
  const detailHref = buildOrderHref(order.id, order.display_id);
  const trackHref = buildTrackHref(order.id, order.display_id);
  const cardActions = getOrderCardActions(order);
  const StatusIcon = STATUS_STYLE[bucket].icon;

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

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-[0_4px_20px_-8px_rgba(15,23,42,0.12)]">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3.5 sm:grid-cols-[1fr_1fr_auto] sm:px-5">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Order placed</p>
          <p className="mt-1 text-xs font-medium text-slate-700">{formatAccountDate(order.created_at)}</p>
        </div>
        <div className="text-right sm:text-left">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Order total</p>
          <p className="mt-1 text-xs font-semibold tabular-nums text-slate-900">{formatAccountCurrency(order.total, order.currency_code)}</p>
        </div>
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:block sm:text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Order number</p>
          <p className="text-xs font-semibold text-slate-700 sm:mt-1">{orderLabel}</p>
        </div>
      </div>

      <div className="flex items-start gap-4 px-4 py-5 sm:gap-5 sm:px-5 sm:py-6">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 sm:h-[88px] sm:w-[88px]">
          {imageFailed ? (
            <Package className="h-8 w-8 text-slate-300" aria-label="Product image unavailable" />
          ) : (
            <Image
              src={imageSrc}
              alt={firstItem?.title || "Order item"}
              fill
              className="object-contain p-2"
              sizes="88px"
              onError={() => setImageFailed(true)}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:justify-between sm:gap-4">
            <h2 className="line-clamp-2 text-sm font-semibold leading-relaxed text-slate-900">
              {firstItem?.title || `Order ${orderLabel}`}
            </h2>
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset", STATUS_STYLE[bucket].className)}>
              <StatusIcon className="h-3.5 w-3.5" aria-hidden />
              {statusLabel}
            </span>
          </div>
          {(order.items?.length || 0) > 1 ? (
            <p className="mt-2 text-xs text-slate-500">
              +{(order.items?.length || 0) - 1} more item
              {(order.items?.length || 0) - 1 > 1 ? "s" : ""}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
        {cardActions.showTrack ? (
          <Link
            href={trackHref}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2 text-xs font-semibold text-green-800 transition hover:bg-green-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
          >
            <AccountHubIcon name="track-order" size={16} className="h-4 w-4" />
            Track Order
          </Link>
        ) : null}
        {cardActions.showViewDetails ? (
          <Link
            href={detailHref}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
          >
            <AccountHubIcon name="view-details" size={16} className="h-4 w-4" />
            View Details
          </Link>
        ) : null}
        {cardActions.showCancel ? (
          <Link
            href={`${detailHref}${detailHref.includes("?") ? "&" : "?"}action=cancel`}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
          >
            <AccountHubIcon name="cancel-order" size={16} className="h-4 w-4" />
            Cancel Order
          </Link>
        ) : null}
        {cardActions.showReturn ? (
          <Link
            href={`${detailHref}${detailHref.includes("?") ? "&" : "?"}action=return`}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-orange-200 bg-white px-3.5 py-2 text-xs font-medium text-orange-800 transition hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
          >
            <AccountHubIcon name="return-refund" size={16} className="h-4 w-4" />
            Return / Replace
          </Link>
        ) : null}
        {cardActions.showBuyAgain && variantId ? (
          <button
            type="button"
            disabled={addToCart.isPending}
            aria-busy={addToCart.isPending || undefined}
            onClick={() => void handleBuyAgain()}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[#326b29] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#285722] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:cursor-wait disabled:opacity-60 sm:ml-auto"
          >
            {addToCart.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <AccountHubIcon name="buy-again" size={16} className="h-4 w-4 brightness-0 invert" />
            )}
            {addToCart.isPending ? "Adding…" : "Buy Again"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function OrdersContent({ embedded = false }: OrdersContentProps) {
  const { customer } = useAuth();
  const [listPage, setListPage] = useState(1);
  const { orders, counts, loading, error, refresh, totalPages, page, hasMore } =
    useAccountOrdersSummary({ page: listPage, pageSize: 15 });
  const [activeStat, setActiveStat] = useState<StatusFilter>("all");
  const [dropdownStatus, setDropdownStatus] = useState<DropdownStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastSixMonthsOnly, setLastSixMonthsOnly] = useState(false);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const bucket = resolveOrderBucket(order);
        if (activeStat !== "all" && bucket !== activeStat) return false;
        if (dropdownStatus !== "all" && bucket !== dropdownStatus) return false;
        if (lastSixMonthsOnly && !isWithinLastSixMonths(order.created_at)) return false;
        return orderMatchesSearch(order, searchQuery);
      })
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
  }, [orders, activeStat, dropdownStatus, lastSixMonthsOnly, searchQuery]);

  const isRefreshing = loading && orders.length > 0;
  const showSkeleton = loading && orders.length === 0;

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
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-2 scrollbar-hide sm:px-3">
          {STATUS_TABS.map((card) => {
            const count =
              card.key === "all" ? counts.all : counts[card.key as AccountOrderBucket];
            const isActive = activeStat === card.key;
            return (
              <button
                key={card.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setActiveStat(card.key);
                  if (card.key === "all") {
                    setDropdownStatus("all");
                  } else {
                    setDropdownStatus(card.key);
                  }
                }}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 border-b-2 px-3 py-4 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-600",
                  isActive
                    ? "border-[#326b29] text-[#326b29]"
                    : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-900"
                )}
              >
                <span>{card.label}</span>
                <span className={cn("inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", isActive ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-500")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 items-center gap-2.5 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:p-4">
          <div className="relative col-span-2 min-w-0 sm:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search orders or products"
              aria-label="Search by order ID or product"
              className="h-10 rounded-lg border-slate-200 bg-slate-50/50 pl-9 text-sm shadow-none placeholder:text-slate-400 focus-visible:ring-green-600/20"
            />
          </div>

          <Select
            value={dropdownStatus}
            onValueChange={(value) => {
              const next = value as DropdownStatusFilter;
              setDropdownStatus(next);
              setActiveStat(next);
            }}
          >
            <SelectTrigger aria-label="Filter by order status" className="h-10 w-full rounded-lg border-slate-200 text-xs font-medium text-slate-600 shadow-none sm:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="returns">Returns</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={lastSixMonthsOnly ? "6months" : "all-time"}
            onValueChange={(value) => setLastSixMonthsOnly(value === "6months")}
          >
            <SelectTrigger aria-label="Filter by order date" className="h-10 w-full rounded-lg border-slate-200 text-xs font-medium text-slate-600 shadow-none sm:w-32">
              <SelectValue placeholder="Timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-time">All time</SelectItem>
              <SelectItem value="6months">Last 6 months</SelectItem>
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh orders"
            title="Refresh orders"
            className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-green-800 disabled:opacity-50 sm:col-span-1"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
            <span className="sm:sr-only">Refresh</span>
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 px-0.5 text-xs text-slate-500" aria-live="polite">
        <p>
          {showSkeleton ? "Loading your orders…" : <><span className="font-semibold text-slate-700">{filteredOrders.length}</span> {filteredOrders.length === 1 ? "order" : "orders"}{activeStat !== "all" || searchQuery.trim() || lastSixMonthsOnly ? " found" : " on this page"}</>}
        </p>
        {isRefreshing ? (
          <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Updating…</span>
        ) : <span>Most recent first</span>}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {showSkeleton ? (
        <OrdersSkeleton />
      ) : (
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
            filteredOrders.map((order, index) => (
              <OrderCard key={order.id} order={order} index={index} />
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

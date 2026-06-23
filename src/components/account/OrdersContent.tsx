"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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

const STAT_CARDS: Array<{
  key: StatusFilter;
  label: string;
  icon: "processing" | "shipped" | "delivered" | "cancelled";
}> = [
  { key: "all", label: "All", icon: "processing" },
  { key: "processing", label: "Processing", icon: "processing" },
  { key: "shipped", label: "Shipped", icon: "shipped" },
  { key: "delivered", label: "Delivered", icon: "delivered" },
  { key: "canceled", label: "Canceled", icon: "cancelled" },
];

const STATUS_LABELS: Record<AccountOrderBucket, string> = {
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  canceled: "Canceled",
};

const STATUS_TEXT_CLASS: Record<AccountOrderBucket, string> = {
  processing: "text-amber-600",
  shipped: "text-sky-600",
  delivered: "text-[#66C940]",
  canceled: "text-rose-500",
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
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm animate-pulse"
        >
          <div className="flex gap-4">
            <div className="h-16 w-16 rounded-xl bg-gray-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-gray-100" />
              <div className="h-3 w-24 rounded bg-gray-100" />
              <div className="h-3 w-40 rounded bg-gray-100" />
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
  const bucket = resolveOrderBucket(order);
  const statusLabel = STATUS_LABELS[bucket];
  const firstItem = order.items?.[0];
  const imageSrc = firstItem?.thumbnail || "/oweg_logo.png";
  const variantId = resolveVariantId(order);
  const orderLabel =
    order.display_id != null ? `#${order.display_id}` : `#${index + 1}`;
  const detailHref = buildOrderHref(order.id, order.display_id);
  const trackHref = buildTrackHref(order.id, order.display_id);
  const cardActions = getOrderCardActions(order);

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
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#EAF8E7] ring-1 ring-gray-100">
          <Image
            src={imageSrc}
            alt={firstItem?.title || "Order item"}
            fill
            className="object-cover"
            sizes="64px"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[#1F2A33]">
                Order {orderLabel}
              </p>
              <p className="text-xs text-gray-500">{formatAccountDate(order.created_at)}</p>
            </div>
            <p className="text-sm font-bold text-[#1F2A33]">
              {formatAccountCurrency(order.total, order.currency_code)}
            </p>
          </div>

          {firstItem?.title ? (
            <p className="line-clamp-2 text-sm text-gray-700">{firstItem.title}</p>
          ) : null}

          <p className={cn("text-xs font-semibold uppercase tracking-wide", STATUS_TEXT_CLASS[bucket])}>
            {statusLabel}
          </p>

          {(order.items?.length || 0) > 1 ? (
            <p className="text-xs text-gray-500">
              +{(order.items?.length || 0) - 1} more item
              {(order.items?.length || 0) - 1 > 1 ? "s" : ""}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:px-5">
        {cardActions.showTrack ? (
          <Link
            href={trackHref}
            className="inline-flex items-center gap-2 rounded-full border border-[#66C940]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#66C940] transition hover:bg-[#EAF8E7]"
          >
            <AccountHubIcon name="track-order" size={16} className="h-4 w-4" />
            Track Order
          </Link>
        ) : null}
        {cardActions.showViewDetails ? (
          <Link
            href={detailHref}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#1F2A33] transition hover:border-[#66C940]/40 hover:text-[#66C940]"
          >
            <AccountHubIcon name="view-details" size={16} className="h-4 w-4" />
            View Details
          </Link>
        ) : null}
        {cardActions.showCancel ? (
          <Link
            href={`${detailHref}${detailHref.includes("?") ? "&" : "?"}action=cancel`}
            className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#D92D20] transition hover:bg-red-50"
          >
            <AccountHubIcon name="cancel-order" size={16} className="h-4 w-4" />
            Cancel Order
          </Link>
        ) : null}
        {cardActions.showReturn ? (
          <Link
            href={`${detailHref}${detailHref.includes("?") ? "&" : "?"}action=return`}
            className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#F79009] transition hover:bg-orange-50"
          >
            <AccountHubIcon name="return-refund" size={16} className="h-4 w-4" />
            Return / Replace
          </Link>
        ) : null}
        {cardActions.showBuyAgain && variantId ? (
          <button
            type="button"
            disabled={addToCart.isPending}
            onClick={() => void handleBuyAgain()}
            className="inline-flex items-center gap-2 rounded-full bg-[#66C940] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5ab838] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {addToCart.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <AccountHubIcon name="buy-again" size={16} className="h-4 w-4 brightness-0 invert" />
            )}
            Buy Again
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function OrdersContent({ embedded = false }: OrdersContentProps) {
  const { customer } = useAuth();
  const { orders, counts, loading, error, refresh } = useAccountOrdersSummary();
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

  const wrapperClass = embedded ? "space-y-5" : "mx-auto max-w-5xl space-y-6 px-4 py-10";

  return (
    <div className={wrapperClass}>
      {!embedded ? (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF8E7]">
            <AccountHubIcon name="orders" size={22} className="h-[22px] w-[22px]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#1F2A33]">Your Orders</h1>
            <p className="text-sm text-gray-600">Track every purchase in one place.</p>
          </div>
          {isRefreshing ? (
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating...
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {STAT_CARDS.map((card) => {
          const count =
            card.key === "all" ? counts.all : counts[card.key as AccountOrderBucket];
          const isActive = activeStat === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                setActiveStat(card.key);
                if (card.key === "all") {
                  setDropdownStatus("all");
                } else {
                  setDropdownStatus(card.key);
                }
              }}
              className={cn(
                "rounded-2xl border px-3 py-3 text-left transition",
                isActive
                  ? "border-[#66C940] bg-[#EAF8E7] shadow-sm"
                  : "border-gray-200 bg-white hover:border-[#66C940]/40 hover:bg-[#EAF8E7]/40"
              )}
            >
              <div className="mb-1 flex items-center gap-2">
                {card.key !== "all" ? (
                  <AccountHubIcon name={card.icon} size={18} className="h-[18px] w-[18px]" />
                ) : (
                  <AccountHubIcon name="package" size={18} className="h-[18px] w-[18px]" />
                )}
                <span
                  className={cn(
                    "text-xs font-medium",
                    isActive ? "text-[#66C940]" : "text-gray-600"
                  )}
                >
                  {card.label}
                </span>
              </div>
              <p className={cn("text-xl font-bold", isActive ? "text-[#66C940]" : "text-[#1F2A33]")}>
                {count}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <AccountHubIcon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60"
          />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by order ID or product"
            className="h-10 rounded-xl border-gray-200 pl-9 text-sm"
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
          <SelectTrigger className="h-10 min-w-[160px] rounded-xl border-gray-200 text-sm font-medium">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={lastSixMonthsOnly ? "6months" : "all-time"}
          onValueChange={(value) => setLastSixMonthsOnly(value === "6months")}
        >
          <SelectTrigger className="h-10 min-w-[160px] rounded-xl border-gray-200 text-sm font-medium">
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
          className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-[#1F2A33] transition hover:border-[#66C940]/40 hover:text-[#66C940] disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {showSkeleton ? (
        <OrdersSkeleton />
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-base font-semibold text-[#1F2A33]">
            {orders.length === 0 ? "You have no orders yet." : "No orders match your filters."}
          </p>
          {orders.length === 0 ? (
            <Link
              href="/"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-[#66C940] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5ab838]"
            >
              Continue shopping
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order, index) => (
            <OrderCard key={order.id} order={order} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

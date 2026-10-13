"use client";

import Link from "next/link";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import {
  formatAccountCurrency,
  formatAccountDate,
} from "@/lib/account-utils";
import { useAccountOrdersSummary } from "@/hooks/useAccountOrdersSummary";
import type { AccountOrder } from "@/hooks/useAccountOrdersSummary";
import { buildOrderHref, buildTrackHref } from "@/lib/order-utils";
import { cn } from "@/lib/utils";

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Cancelled: "bg-rose-50 text-rose-700",
  Delivered: "bg-green-50 text-green-800",
  Shipped: "bg-sky-50 text-sky-800",
  "Payment pending": "bg-amber-50 text-amber-800",
  Processing: "bg-amber-50 text-amber-800",
};

function orderStatusLabel(order: AccountOrder): string {
  const fulfillment = (order.fulfillment_status || "").toLowerCase();
  const payment = (order.payment_status || "").toLowerCase();
  const status = (order.status || "").toLowerCase();

  if (status === "canceled" || status === "cancelled") return "Cancelled";
  if (fulfillment === "delivered") return "Delivered";
  if (fulfillment === "shipped" || fulfillment === "partially_shipped") return "Shipped";
  if (payment === "awaiting" || payment === "requires_action") return "Payment pending";
  return "Processing";
}

function OrderRow({ order }: { order: AccountOrder }) {
  const orderLabel = order.display_id
    ? `#${order.display_id}`
    : `#${order.id.slice(-6)}`;
  const trackHref = buildTrackHref(order.id, order.display_id);
  const detailHref = buildOrderHref(order.id, order.display_id);

  return (
    <div className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900">
            Order {orderLabel}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {formatAccountDate(order.created_at)}
          </p>
          {order.items?.[0]?.title ? (
            <p className="mt-2 line-clamp-1 text-xs leading-relaxed text-slate-600">
              {order.items[0].title}
              {order.items.length > 1 ? ` +${order.items.length - 1} more` : ""}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-2">
          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold tabular-nums text-slate-900">
              {formatAccountCurrency(order.total, order.currency_code)}
            </p>
            <p className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE_CLASSES[orderStatusLabel(order)])}>{orderStatusLabel(order)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={trackHref}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-[11px] font-medium text-[#326b29] transition-colors hover:bg-green-100"
            >
              <AccountHubIcon name="track-order" size={14} className="h-3.5 w-3.5" />
              Track
            </Link>
            <Link
              href={detailHref}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <AccountHubIcon name="view-details" size={14} className="h-3.5 w-3.5" />
              Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RecentOrdersCard() {
  const { orders, loading, error } = useAccountOrdersSummary();
  const recentOrders = [...orders]
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 3);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <AccountHubIcon name="package" size={18} className="h-[18px] w-[18px]" />
          <h2 className="text-sm font-semibold text-slate-900">
            Recent Orders
          </h2>
        </div>

        <Link
          href="/account/orders"
          className="text-[11px] font-medium text-[#326b29] transition-colors hover:underline"
        >
          View all orders
        </Link>
      </div>

      <div className="divide-y divide-slate-100">
        {loading ? (
          <p className="px-5 py-6 text-sm text-slate-500">Loading orders…</p>
        ) : null}

        {error ? (
          <p className="px-5 py-6 text-sm text-rose-600">{error}</p>
        ) : null}

        {!loading && !error && recentOrders.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No recent orders yet.</p>
        ) : null}

        {recentOrders.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </div>
    </section>
  );
}

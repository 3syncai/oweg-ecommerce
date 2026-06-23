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
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-3 md:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1F2A33] md:text-base">
            Order {orderLabel}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 md:text-sm">
            {formatAccountDate(order.created_at)}
          </p>
          {order.items?.[0]?.title ? (
            <p className="mt-1 line-clamp-1 text-xs text-gray-600 md:text-sm">
              {order.items[0].title}
              {order.items.length > 1 ? ` +${order.items.length - 1} more` : ""}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
          <div className="text-left sm:text-right">
            <p className="text-sm font-semibold text-[#1F2A33] md:text-base">
              {formatAccountCurrency(order.total, order.currency_code)}
            </p>
            <p className="text-xs text-[#66C940] md:text-sm">{orderStatusLabel(order)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={trackHref}
              className="inline-flex items-center gap-1 rounded-full border border-[#66C940] px-3 py-1 text-xs font-medium text-[#66C940] transition-colors hover:bg-[#EAF8E7] md:text-sm"
            >
              <AccountHubIcon name="track-order" size={14} className="h-3.5 w-3.5" />
              Track
            </Link>
            <Link
              href={detailHref}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-[#1F2A33] transition-colors hover:border-[#66C940]/40 hover:text-[#66C940] md:text-sm"
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
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AccountHubIcon name="package" size={22} className="h-[22px] w-[22px]" />
          <h3 className="text-base font-semibold text-[#1F2A33] md:text-lg">
            Recent Orders
          </h3>
        </div>

        <Link
          href="/account/orders"
          className="text-xs font-medium text-[#66C940] transition-colors hover:text-[#5ab838] md:text-sm"
        >
          View all orders
        </Link>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-gray-500">Loading orders…</p>
        ) : null}

        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : null}

        {!loading && !error && recentOrders.length === 0 ? (
          <p className="text-sm text-gray-500">No recent orders yet.</p>
        ) : null}

        {recentOrders.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Package, ReceiptIndianRupee } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";

type Order = {
  id: string;
  display_id?: number;
  created_at?: string;
  currency_code?: string;
  total?: number;
  payment_status?: string;
  fulfillment_status?: string;
  items?: Array<{
    id: string;
    title?: string;
    quantity?: number;
    thumbnail?: string;
  }>;
};

const formatDate = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const formatCurrency = (value?: number, currency?: string) => {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: (currency || "INR").toUpperCase(),
    maximumFractionDigits: 0,
  }).format(value);
};

const statusLabel = (payment?: string, fulfillment?: string) => {
  if (fulfillment === "shipped") return "Shipped";
  if (fulfillment === "delivered") return "Delivered";
  if (payment === "awaiting" || payment === "requires_action") return "Payment pending";
  if (payment === "captured" || payment === "paid") return "Processing";
  return "Processing";
};

export default function OrdersPage() {
  const { customer, refresh } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<"latest" | "oldest" | "amount-high" | "amount-low">("latest");
  const [scope, setScope] = useState<"page" | "all">("page");
  const limit = 20;

  useEffect(() => {
    if (!customer) return;
    if (!customer?.id) {
      router.push("/login?redirect=/orders");
    }
  }, [customer, router]);

  const loadOrders = useCallback(
    async (allowRetry = true, showSpinner = true) => {
      if (!customer?.id) return;
      const fetchLimit = scope === "all" && count ? count : limit;
      const offset = scope === "all" ? 0 : page * limit;
      if (showSpinner) setLoading(true);
      try {
        const res = await fetch(`/api/medusa/orders?limit=${fetchLimit}&offset=${offset}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (res.status === 401 && allowRetry) {
          await refresh();
          return loadOrders(false, showSpinner);
        }
        if (!res.ok) throw new Error("Unable to load orders");
        const data = await res.json();
        setOrders((data.orders || []) as Order[]);
        if (typeof data.count === "number") setCount(data.count);
        setError(null);
      } catch {
        setError("Could not load orders right now.");
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [customer?.id, scope, count, page, refresh]
  );

  useEffect(() => {
    void loadOrders(true, true);
  }, [loadOrders]);

  useEffect(() => {
    if (!customer?.id) return;
    const onFocus = () => {
      void loadOrders(false, false);
    };
    const interval = window.setInterval(() => {
      void loadOrders(false, false);
    }, 10000);

    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [customer?.id, loadOrders]);

  const emptyState = useMemo(
    () => !loading && (!orders || orders.length === 0),
    [loading, orders]
  );

  const sortedOrders = useMemo(() => {
    const list = [...orders];
    switch (sort) {
      case "latest":
        return list.sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
      case "oldest":
        return list.sort(
          (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
      case "amount-high":
        return list.sort((a, b) => (b.total || 0) - (a.total || 0));
      case "amount-low":
        return list.sort((a, b) => (a.total || 0) - (b.total || 0));
      default:
        return list;
    }
  }, [orders, sort]);

  const totalPages = count !== null ? Math.max(1, Math.ceil(count / limit)) : null;
  const hasNext =
    scope === "all"
      ? false
      : count !== null
        ? (page + 1) * limit < count
        : orders.length === limit;
  const hasPrev = scope === "all" ? false : page > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
          <Package className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Your Orders</h1>
          <p className="text-sm text-gray-600">Track every purchase in one place.</p>
        </div>
      </div>

      {!customer && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm font-semibold">
          Please log in to view your orders.
        </div>
      )}

      {loading && (
        <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading your orders
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
          {error}
        </div>
      )}

      {emptyState && customer && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-600">
          You have no orders yet.
        </div>
      )}

      {!emptyState && (
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="min-w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
            >
              <option value="latest">Latest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount-high">Amount: high to low</option>
              <option value="amount-low">Amount: low to high</option>
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <span>Apply to</span>
            <select
              value={scope}
              onChange={(e) => {
                const nextScope = e.target.value as typeof scope;
                setScope(nextScope);
                setPage(0);
              }}
              className="min-w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
            >
              <option value="page">Current page</option>
              <option value="all">All orders</option>
            </select>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sortedOrders.map((order) => {
          const label = statusLabel(order.payment_status, order.fulfillment_status);
          const firstItem = order.items?.[0];
          return (
            <Link
              key={order.id}
              href={`/orders/${encodeURIComponent(order.id)}`}
              className="block p-4 hover:-translate-y-0.5 transition hover:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.35)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">Order #{order.display_id || order.id.slice(-6)}</p>
                  <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                  <p className="text-xs text-emerald-700 font-semibold">{label}</p>
                </div>
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                  <ReceiptIndianRupee className="w-4 h-4 text-emerald-600" />
                  {formatCurrency(order.total, order.currency_code)}
                </div>
              </div>
              {firstItem && (
                <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                  {firstItem.title} {order.items && order.items.length > 1 ? `+ ${order.items.length - 1} more` : ""}
                </p>
              )}
            </Link>
          );
        })}
      </div>

      {!emptyState && (
        <div className="flex items-center justify-between gap-3 pt-4">
          <div className="text-xs text-gray-600">
            {count !== null
              ? `Page ${page + 1} of ${totalPages}`
              : `Showing ${orders.length} orders`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!hasPrev || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-3 py-1.5 rounded-lg border text-sm font-semibold disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!hasNext || loading}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border text-sm font-semibold disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

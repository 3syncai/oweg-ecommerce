"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Filter, Package, ReceiptIndianRupee } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Order = {
  id: string;
  display_id?: number;
  created_at?: string;
  currency_code?: string;
  status?: string;
  total?: number;
  payment_status?: string;
  fulfillment_status?: string;
  metadata?: Record<string, unknown>;
  items?: Array<{
    id: string;
    title?: string;
    quantity?: number;
    thumbnail?: string;
  }>;
};

type ReturnRequest = {
  order_id?: string | number;
  order?: { id?: string | number } | null;
  orderId?: string | number;
  status?: string;
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

const resolveOrderStatus = (order: Order, returnStatus?: string) => {
  const payment = (order.payment_status || "").toLowerCase();
  const fulfillment = (order.fulfillment_status || "").toLowerCase();
  const status = (order.status || "").toLowerCase();
  const returnStatusValue = (returnStatus || "").toLowerCase();

  const returnStatuses = new Set([
    "pending_approval",
    "approved",
    "pickup_scheduled",
    "pickup_initiated",
    "picked_up",
    "received",
    "refunded",
    "replaced",
    "rejected",
    "closed",
  ]);

  if (status === "canceled" || status === "cancelled") return "Cancel";
  if (
    status.includes("return") ||
    payment === "refunded" ||
    payment === "partially_refunded" ||
    returnStatuses.has(returnStatusValue)
  ) {
    return "Return";
  }
  if (["shipped", "partially_shipped", "delivered"].includes(fulfillment)) return "Shipped";
  if (fulfillment === "processing") return "Processing";
  if (["captured", "paid", "cod"].includes(payment)) return "Payment confirmed";
  if (["awaiting", "requires_action", "pending", "not_paid"].includes(payment)) return "Order placed";
  return "Order placed";
};

const resolvePaymentMethod = (order: Order) => {
  const meta = (order.metadata || {}) as Record<string, unknown>;
  const method = typeof meta.payment_method === "string" ? meta.payment_method.toLowerCase() : "";
  const razorpayStatus =
    typeof meta.razorpay_payment_status === "string" ? meta.razorpay_payment_status.toLowerCase() : "";
  const codStatus = typeof meta.cod_status === "string" ? meta.cod_status.toLowerCase() : "";
  const payment = (order.payment_status || "").toLowerCase();
  const isCod =
    method.includes("cod") ||
    razorpayStatus === "cod" ||
    codStatus.length > 0 ||
    payment === "cod";
  return isCod ? "cod" : "online";
};

const ORDER_PAGE_SIZE = 12;

const buildPagination = (page: number, totalPages: number) => {
  if (totalPages <= 1) return [];

  const pages = new Set<number>([0, totalPages - 1, page]);
  if (page - 1 >= 0) pages.add(page - 1);
  if (page + 1 < totalPages) pages.add(page + 1);
  if (page - 2 >= 0) pages.add(page - 2);
  if (page + 2 < totalPages) pages.add(page + 2);

  const ordered = Array.from(pages).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];

  ordered.forEach((value, index) => {
    if (index > 0 && value - ordered[index - 1] > 1) {
      result.push("ellipsis");
    }
    result.push(value);
  });

  return result;
};

function OrdersSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`order-skeleton-${index}`}
          className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm animate-pulse"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="h-4 w-24 rounded bg-slate-100" />
              <div className="h-3 w-20 rounded bg-slate-100" />
              <div className="h-3 w-28 rounded bg-slate-100" />
            </div>
            <div className="space-y-3 text-right">
              <div className="ml-auto h-3 w-32 rounded bg-slate-100" />
              <div className="ml-auto h-4 w-24 rounded bg-slate-100" />
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {Array.from({ length: 2 }).map((__, itemIndex) => (
              <div key={`order-skeleton-item-${index}-${itemIndex}`} className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-slate-100" />
                  <div className="h-3 w-20 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OrdersPage() {
  const { customer, refresh } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<"latest" | "oldest" | "amount-high" | "amount-low">("latest");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "order-placed" | "payment-confirmed" | "shipped" | "return" | "cancel"
  >("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "cod" | "online">("all");
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadOrders = useCallback(
    async (allowRetry = true, showSpinner = true) => {
      if (!customer?.id) return;
      const offset = page * ORDER_PAGE_SIZE;
      if (showSpinner) setLoading(true);
      try {
        const res = await fetch(`/api/medusa/orders?limit=${ORDER_PAGE_SIZE}&offset=${offset}`, {
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
    [customer?.id, page, refresh]
  );

  useEffect(() => {
    void loadOrders(true, true);
  }, [loadOrders]);

  useEffect(() => {
    if (!customer?.id) return;
    const onFocus = () => {
      void loadOrders(false, false);
    };
    window.addEventListener("focus", onFocus);

    const interval = window.setInterval(() => {
      void loadOrders(false, false);
    }, 10000);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [customer?.id, loadOrders]);

  const loadReturnRequests = useCallback(async (allowRetry = true) => {
    if (!customer?.id) return;
    try {
      const res = await fetch("/api/medusa/return-requests", {
        cache: "no-store",
        credentials: "include",
      });
      if (res.status === 401 && allowRetry) {
        await refresh();
        return loadReturnRequests(false);
      }
      if (!res.ok) return;
      const data = await res.json();
      const raw = (data as { return_requests?: unknown } | null)?.return_requests ?? data;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { data?: unknown })?.data)
          ? (raw as { data?: unknown }).data
          : [];
      setReturnRequests(list as ReturnRequest[]);
    } catch {
      // ignore
    }
  }, [customer?.id, refresh]);

  useEffect(() => {
    void loadReturnRequests();
  }, [loadReturnRequests]);

  const returnStatusByOrderId = useMemo(() => {
    const map = new Map<string, string>();
    returnRequests.forEach((req) => {
      const orderId =
        req.order_id ??
        req.orderId ??
        (req.order && typeof req.order === "object" ? req.order.id : undefined);
      if (orderId !== undefined && orderId !== null) {
        map.set(String(orderId), req.status || "");
      }
    });
    return map;
  }, [returnRequests]);

  const emptyState = useMemo(
    () => !loading && (!orders || orders.length === 0),
    [loading, orders]
  );
  const showSkeleton = loading && orders.length === 0;
  const isRefreshing = loading && orders.length > 0;

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const returnStatus =
        returnStatusByOrderId.get(String(order.id)) ||
        (order.display_id !== undefined
          ? returnStatusByOrderId.get(String(order.display_id))
          : undefined);
      const status = resolveOrderStatus(order, returnStatus);
      if (statusFilter !== "all") {
        const statusKey =
          status === "Order placed"
            ? "order-placed"
            : status === "Payment confirmed"
              ? "payment-confirmed"
                : status === "Shipped"
                  ? "shipped"
                  : status === "Return"
                    ? "return"
                    : "cancel";
        if (statusKey !== statusFilter) return false;
      }

      if (paymentFilter !== "all") {
        const method = resolvePaymentMethod(order);
        if (method !== paymentFilter) return false;
      }

      return true;
    });
  }, [orders, statusFilter, paymentFilter, returnStatusByOrderId]);

  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders];
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
  }, [filteredOrders, sort]);

  const totalPages = count !== null ? Math.max(1, Math.ceil(count / ORDER_PAGE_SIZE)) : null;
  const hasNext = count !== null ? (page + 1) * ORDER_PAGE_SIZE < count : orders.length === ORDER_PAGE_SIZE;
  const hasPrev = page > 0;
  const paginationItems = totalPages ? buildPagination(page, totalPages) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
          <Package className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">Your Orders</h1>
          <p className="text-sm text-gray-600">Track every purchase in one place.</p>
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((prev) => !prev)}
          className="ml-auto inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 shadow-xs transition hover:bg-gray-50 sm:hidden"
          aria-label="Toggle filters"
        >
          <Filter className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-90" : ""}`} />
        </button>
      </div>

      {!customer && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-xl font-semibold text-slate-900 mb-2">Sign in to view your orders</p>
          <p className="text-sm text-slate-500 mb-5">
            Please log in to check order status, invoices, and delivery updates.
          </p>
          <Link
            href="/login?redirect=/orders"
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition"
          >
            Login
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
          {error}
        </div>
      )}

      {isRefreshing && (
        <div className="overflow-hidden rounded-full bg-slate-100">
          <div className="h-1 w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-emerald-500" />
        </div>
      )}

      {emptyState && customer && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-600">
          You have no orders yet.
        </div>
      )}

      {!emptyState && sortedOrders.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-600">
          No orders match the selected filters.
        </div>
      )}

      {!emptyState && (
        <div
          className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-row lg:flex-wrap lg:items-center ${filtersOpen ? "block" : "hidden"} sm:grid`}
        >
          <div className="flex flex-col gap-1 text-sm font-semibold text-gray-800 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-xs text-gray-500 sm:text-sm sm:text-gray-800">Sort by</span>
            <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
              <SelectTrigger className="min-w-[150px] rounded-lg border-gray-200 bg-white text-sm font-semibold text-gray-800">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="amount-high">Amount: high to low</SelectItem>
                <SelectItem value="amount-low">Amount: low to high</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 text-sm font-semibold text-gray-800 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-xs text-gray-500 sm:text-sm sm:text-gray-800">Status</span>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="min-w-[170px] rounded-lg border-gray-200 bg-white text-sm font-semibold text-gray-800">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="order-placed">Order placed</SelectItem>
                <SelectItem value="payment-confirmed">Payment confirmed</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="return">Return</SelectItem>
                <SelectItem value="cancel">Cancel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 text-sm font-semibold text-gray-800 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-xs text-gray-500 sm:text-sm sm:text-gray-800">Payment</span>
            <Select value={paymentFilter} onValueChange={(value) => setPaymentFilter(value as typeof paymentFilter)}>
              <SelectTrigger className="min-w-[170px] rounded-lg border-gray-200 bg-white text-sm font-semibold text-gray-800">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="cod">COD</SelectItem>
                <SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {showSkeleton ? (
        <OrdersSkeleton />
      ) : (
        <div className="space-y-4">
          {sortedOrders.map((order, index) => {
          const returnStatus =
            returnStatusByOrderId.get(String(order.id)) ||
            (order.display_id !== undefined
              ? returnStatusByOrderId.get(String(order.display_id))
              : undefined);
          const label = resolveOrderStatus(order, returnStatus);
          const items = order.items || [];
          const previewItems = items.slice(0, 3);
          const remainingItems = Math.max(0, items.length - previewItems.length);
          const baseIndex = page * ORDER_PAGE_SIZE + index;
          const serialNumber =
            count !== null && sort === "latest" && statusFilter === "all" && paymentFilter === "all"
              ? Math.max(1, count - baseIndex)
              : baseIndex + 1;
          return (
            <Link
              key={order.id}
              href={`/orders/${encodeURIComponent(order.id)}?orderNo=${serialNumber}`}
              className="block overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(15,23,42,0.38)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">Order {serialNumber}</p>
                  <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                  <p className="text-xs text-emerald-700 font-semibold">{label}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs text-gray-500">Order ID: <span className="font-medium text-gray-700">{order.id}</span></p>
                  <div className="text-sm font-semibold text-gray-900 flex items-center justify-end gap-1">
                    <ReceiptIndianRupee className="w-4 h-4 text-emerald-600" />
                    {formatCurrency(order.total, order.currency_code)}
                  </div>
                </div>
              </div>
              {previewItems.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {previewItems.map((item) => {
                    const imageSrc = item.thumbnail || "/oweg_logo.png";
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        <div className="relative h-14 w-14 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                          <Image
                            src={imageSrc}
                            alt={item.title || "Product"}
                            fill
                            className="object-cover"
                            loading="lazy"
                            sizes="56px"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-medium text-slate-900">
                            {item.title || "Ordered item"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Qty {item.quantity || 1}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {remainingItems > 0 && (
                    <p className="text-xs font-medium text-slate-500">
                      +{remainingItems} more item{remainingItems > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Item details are being prepared for this order.
                </div>
              )}
            </Link>
          );
        })}
        </div>
      )}

      {!emptyState && (
        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-600">
            {count !== null
              ? `Showing page ${page + 1} of ${totalPages} · ${count} total orders`
              : `Showing ${orders.length} orders`}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!hasPrev || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            {paginationItems.map((item, index) =>
              item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="px-2 text-sm text-slate-400">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPage(item)}
                  disabled={item === page || loading}
                  className={`min-w-10 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    item === page
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                  } disabled:cursor-default`}
                  aria-current={item === page ? "page" : undefined}
                >
                  {item + 1}
                </button>
              )
            )}
            <button
              type="button"
              disabled={!hasNext || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

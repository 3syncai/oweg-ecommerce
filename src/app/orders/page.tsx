"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  }).format(value / 100);
};

const statusLabel = (payment?: string, fulfillment?: string) => {
  if (fulfillment === "shipped") return "Shipped";
  if (fulfillment === "delivered") return "Delivered";
  if (payment === "awaiting" || payment === "requires_action") return "Payment pending";
  if (payment === "captured" || payment === "paid") return "Processing";
  return "Processing";
};

export default function OrdersPage() {
  const { customer } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    const loadOrders = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/medusa/orders", { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to load orders");
        const data = await res.json();
        setOrders((data.orders || []) as Order[]);
      } catch {
        setError("Could not load orders right now.");
      } finally {
        setLoading(false);
      }
    };
    void loadOrders();
  }, [customer]);

  const emptyState = useMemo(
    () => !loading && (!orders || orders.length === 0),
    [loading, orders]
  );

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
          Loading your orders…
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

      <div className="space-y-3">
        {orders.map((order) => {
          const label = statusLabel(order.payment_status, order.fulfillment_status);
          const firstItem = order.items?.[0];
          return (
            <Link
              key={order.id}
              href={`/orders/${encodeURIComponent(order.id)}`}
              className="block rounded-2xl border border-gray-100 bg-white p-4 hover:-translate-y-0.5 transition hover:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.35)]"
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
    </div>
  );
}

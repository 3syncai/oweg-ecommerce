"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, ChevronRight, Clock, Loader2, MapPin, Package, Phone, ReceiptIndianRupee, User2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";

type OrderItem = {
  id: string;
  title?: string;
  quantity?: number;
  thumbnail?: string;
  unit_price?: number;
};

type Address = {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  province?: string;
  country_code?: string;
  postal_code?: string;
  phone?: string;
};

type OrderDetail = {
  id: string;
  display_id?: number;
  created_at?: string;
  currency_code?: string;
  total?: number;
  subtotal?: number;
  shipping_total?: number;
  tax_total?: number;
  payment_status?: string;
  fulfillment_status?: string;
  items?: OrderItem[];
  shipping_address?: Address;
  billing_address?: Address;
};

const formatDateTime = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatCurrency = (value?: number, currency?: string) => {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: (currency || "INR").toUpperCase(),
    maximumFractionDigits: 0,
  }).format(value);
};

function trackerSteps(order?: OrderDetail) {
  const fulfillment = order?.fulfillment_status || "";
  const payment = order?.payment_status || "";

  const shippedStates = ["shipped", "partially_shipped"];
  const deliveredStates = ["delivered"];

  return [
    { key: "placed", label: "Order placed", active: true, icon: Clock },
    { key: "paid", label: "Payment confirmed", active: payment === "captured" || payment === "paid", icon: CheckCircle2 },
    { key: "processing", label: "Processing", active: payment === "captured" || payment === "paid", icon: Package },
    { key: "shipped", label: "Shipped", active: shippedStates.includes(fulfillment) || deliveredStates.includes(fulfillment), icon: Package },
    { key: "delivered", label: "Delivered", active: deliveredStates.includes(fulfillment), icon: CheckCircle2 },
  ];
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);
  const { customer, refresh } = useAuth();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orderRef = useRef<OrderDetail | null>(null);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const loadOrder = useCallback(
    async (allowRetry = true, showSpinner = true) => {
      if (!orderId || !customer?.id) return;
      if (showSpinner) setLoading(true);
      try {
        const res = await fetch(`/api/medusa/orders/${encodeURIComponent(orderId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        if (res.status === 401 && allowRetry) {
          await refresh();
          return loadOrder(false, showSpinner);
        }
        if (!res.ok) throw new Error("Unable to load order");
        const data = await res.json();
        setOrder((data.order || data) as OrderDetail);
        setError(null);
      } catch {
        setError("Could not load order right now.");
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [orderId, customer?.id, refresh]
  );

  useEffect(() => {
    if (!orderId || !customer?.id) return;
    let cancelled = false;

    const fetchLatest = async (allowRetry = true, showSpinner = false) => {
      if (cancelled) return;
      await loadOrder(allowRetry, showSpinner);
    };

    void fetchLatest(true, true);

    const onFocus = () => {
      void fetchLatest(false, false);
    };

    const interval = window.setInterval(() => {
      if (orderRef.current?.fulfillment_status === "delivered") return;
      void fetchLatest(false, false);
    }, 10000);

    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [orderId, customer?.id, loadOrder]);

  const steps = useMemo(() => trackerSteps(order || undefined), [order]);

  if (!customer?.id) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-4">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm font-semibold">
          Please log in to view your order.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
        <Link href="/" className="font-semibold text-emerald-700 hover:underline">
          Home
        </Link>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <Link href="/orders" className="font-semibold text-emerald-700 hover:underline">
          Orders
        </Link>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="font-semibold text-gray-900">#{order?.display_id || order?.id?.slice(-6) || "..."}</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Order #{order?.display_id || order?.id?.slice(-6)}</h1>
          <p className="text-sm text-gray-600">Placed on {formatDateTime(order?.created_at)}</p>
        </div>
        {loading && (
          <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="grid gap-6">
        <div className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-900">Order tracker</p>
          <div className="grid gap-3 sm:grid-cols-5">
            {steps.map((step) => (
              <div key={step.key} className="flex flex-col gap-2">
                <div className={`flex items-center gap-2 text-sm font-semibold ${step.active ? "text-emerald-700" : "text-gray-500"}`}>
                  <step.icon className="w-4 h-4" />
                  {step.label}
                </div>
                <div className={`h-1 rounded-full ${step.active ? "bg-emerald-500" : "bg-gray-200"}`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Status updates refresh as soon as your order progresses.
          </p>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <span className="font-semibold inline-flex items-center gap-2">
              <ReceiptIndianRupee className="w-4 h-4 text-emerald-600" />
              Total: {formatCurrency(order?.total, order?.currency_code)}
            </span>
            <span className="inline-flex items-center gap-2 text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">
              Payment: {order?.payment_status || "pending"}
            </span>
            <span className="inline-flex items-center gap-2 text-xs bg-gray-100 text-gray-800 px-3 py-1 rounded-full">
              Fulfillment: {order?.fulfillment_status || "processing"}
            </span>
          </div>

          <div className="grid gap-3">
            <div className="text-sm font-semibold text-gray-900">Items</div>
            <div className="divide-y border rounded-2xl">
              {order?.items?.map((item) => (
                <div key={item.id} className="flex gap-3 p-3">
                  <div className="h-16 w-16 rounded-xl bg-gray-100 relative overflow-hidden">
                    {item.thumbnail ? (
                      <Image src={item.thumbnail} alt={item.title || "Item"} fill className="object-contain" />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-600">Qty {item.quantity}</p>
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {formatCurrency((item.unit_price || 0) * (item.quantity || 1), order?.currency_code)}
                  </div>
                </div>
              ))}
              {!order?.items?.length && <div className="p-3 text-sm text-gray-600">No items</div>}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
                <User2 className="w-4 h-4 text-emerald-600" />
                Customer
              </p>
              <p className="text-sm text-gray-700">
                {order?.shipping_address?.first_name} {order?.shipping_address?.last_name}
              </p>
              <p className="text-xs text-gray-500">{order?.shipping_address?.phone}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" />
                Shipping address
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {order?.shipping_address?.address_1}
                {order?.shipping_address?.address_2 ? `, ${order.shipping_address.address_2}` : ""}<br />
                {order?.shipping_address?.city}, {order?.shipping_address?.province} {order?.shipping_address?.postal_code}<br />
                {order?.shipping_address?.country_code?.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="text-xs text-gray-500 inline-flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Need help? Call +91 89281 02299 or email support@oweg.in
          </div>
        </div>
      </div>
    </div>
  );
}

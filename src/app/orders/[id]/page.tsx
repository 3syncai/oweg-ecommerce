"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronRight, Clock, Loader2, MapPin, Package, Phone, ReceiptIndianRupee, Undo2, User2, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";
import { Button } from "@/components/ui/button";
import { CancelOrderPanel, CANCELLATION_REASONS } from "@/components/orders/CancelOrderPanel";
import { ReturnOrderPanel, type ReturnItemForm } from "@/components/orders/ReturnOrderPanel";

type OrderItem = {
  id: string;
  title?: string;
  quantity?: number;
  thumbnail?: string;
  unit_price?: number;
  total?: number;
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
  updated_at?: string;
  currency_code?: string;
  status?: string;
  total?: number;
  subtotal?: number;
  shipping_total?: number;
  tax_total?: number;
  payment_status?: string;
  fulfillment_status?: string;
  items?: OrderItem[];
  shipping_address?: Address;
  billing_address?: Address;
  metadata?: Record<string, unknown>;
  display_totals?: {
    itemsSubtotal: number;
    shipping: number;
    coinDiscount: number;
    oweg10Discount: number;
    grandTotal: number;
  };
};

type ReturnRequest = {
  id: string;
  order_id: string;
  status: string;
  type: string;
};

function sanitizeTextInput(value: string, maxLength: number) {
  const withoutControlChars = [...value]
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return (code >= 32 && code !== 127) || ch === "\n" || ch === "\t"
    })
    .join("")

  return withoutControlChars
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/ +/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength)
}

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

function getDeliveryDate(order?: OrderDetail | null) {
  if (!order) return null;
  const meta = (order.metadata || {}) as Record<string, unknown>;
  const fulfillment = order.fulfillment_status || "";
  const delivered =
    (typeof meta.shiprocket_delivered_at === "string" && meta.shiprocket_delivered_at) ||
    (typeof meta.delivered_at === "string" && meta.delivered_at) ||
    ((order as { delivered_at?: string }).delivered_at || "") ||
    (fulfillment === "delivered" ? order.updated_at || order.created_at || "" : "");
  if (!delivered) return null;
  const parsed = new Date(delivered);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function trackerSteps(order?: OrderDetail, returnRequest?: ReturnRequest | null) {
  const fulfillment = order?.fulfillment_status || "";
  const payment = (order?.payment_status || "").toLowerCase();
  const meta = (order?.metadata || {}) as Record<string, unknown>;
  const shiprocketStatusRaw = typeof meta.shiprocket_status === "string" ? meta.shiprocket_status : "";
  const shiprocketStatus = shiprocketStatusRaw.toLowerCase();
  const orderStatus = (order?.status || "").toLowerCase();
  const isCancelled = orderStatus === "canceled" || orderStatus === "cancelled";

  const shippedStates = ["shipped", "partially_shipped"];
  const deliveredStates = ["delivered"];

  const shiprocketShipped = ["picked_up", "pickup_scheduled", "pickup_initiated", "in_transit", "out_for_delivery", "shipped"].includes(shiprocketStatus);
  const shiprocketDelivered = ["delivered"].includes(shiprocketStatus);

  const paymentConfirmed =
    payment === "captured" ||
    payment === "paid" ||
    meta.razorpay_payment_status === "captured";

  if (isCancelled) {
    return [
      { key: "placed", label: "Order placed", active: true, icon: Clock, tone: "default" as const },
      {
        key: "cancelled",
        label: "Order cancelled",
        active: true,
        icon: XCircle,
        tone: "cancelled" as const,
      },
    ];
  }

  const steps = [
    { key: "placed", label: "Order placed", active: true, icon: Clock, tone: "default" as const },
    {
      key: "paid",
      label: "Payment confirmed",
      active: paymentConfirmed,
      icon: CheckCircle2,
      tone: "default" as const,
    },
    {
      key: "processing",
      label: "Processing",
      active: paymentConfirmed,
      icon: Package,
      tone: "default" as const,
    },
    {
      key: "shipped",
      label: "Shipped",
      active: shiprocketShipped || shippedStates.includes(fulfillment) || deliveredStates.includes(fulfillment),
      icon: Package,
      tone: "default" as const,
    },
    {
      key: "delivered",
      label: "Delivered",
      active: shiprocketDelivered || deliveredStates.includes(fulfillment),
      icon: CheckCircle2,
      tone: "default" as const,
    },
  ];

  if (returnRequest) {
    const status = returnRequest.status;
    const labelMap: Record<string, string> = {
      pending_approval: "Return requested",
      approved: "Return approved",
      pickup_initiated: "Pickup scheduled",
      picked_up: "Return picked up",
      received: "Return received",
      refunded: "Refund completed",
      replaced: "Replacement shipped",
      rejected: "Return rejected",
      closed: "Return closed",
    };
    steps.push({
      key: "return",
      label: labelMap[status] || "Return in progress",
      active: true,
      icon: Undo2,
      tone: "default" as const,
    });
  }

  return steps;
}

export default function OrderDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);
  const orderNoRaw = searchParams.get("orderNo");
  const parsedOrderNo = Number(orderNoRaw);
  const orderNumber = Number.isFinite(parsedOrderNo) && parsedOrderNo > 0 ? Math.floor(parsedOrderNo) : null;
  const { customer, refresh } = useAuth();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orderRef = useRef<OrderDetail | null>(null);
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [returnFormOpen, setReturnFormOpen] = useState(false);
  const [returnType, setReturnType] = useState<"return" | "replacement">("return");
  const [returnReason, setReturnReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnItems, setReturnItems] = useState<ReturnItemForm[]>([]);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSuccess, setReturnSuccess] = useState<string | null>(null);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [bankDetails, setBankDetails] = useState({
    account_name: "",
    account_number: "",
    ifsc_code: "",
    bank_name: "",
  });
  const [cancelFormOpen, setCancelFormOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!order?.items?.length) return;
    setReturnItems(
      order.items.map((item) => ({
        order_item_id: item.id,
        title: item.title,
        thumbnail: item.thumbnail,
        quantity: item.quantity || 1,
        max: item.quantity || 1,
        selected: true,
      }))
    );
  }, [order?.items]);

  const loadReturnRequests = useCallback(async () => {
    if (!customer?.id) return;
    try {
      const res = await fetch("/api/medusa/return-requests", {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setReturnRequests((data.return_requests || []) as ReturnRequest[]);
    } catch {
      // ignore
    }
  }, [customer?.id]);

  useEffect(() => {
    void loadReturnRequests();
  }, [loadReturnRequests]);

  const deliveryDate = useMemo(() => getDeliveryDate(order), [order]);
  const returnDeadline = useMemo(() => {
    if (!deliveryDate) return null;
    const deadline = new Date(deliveryDate);
    deadline.setDate(deadline.getDate() + 7);
    return deadline;
  }, [deliveryDate]);
  const withinReturnWindow = useMemo(() => {
    if (!deliveryDate || !returnDeadline) return false;
    return Date.now() <= returnDeadline.getTime();
  }, [deliveryDate, returnDeadline]);

  const existingReturn = useMemo(
    () => returnRequests.find((req) => req.order_id === order?.id),
    [returnRequests, order?.id]
  );

  const isCod = useMemo(() => {
    const meta = (order?.metadata || {}) as Record<string, unknown>;
    const method = typeof meta.payment_method === "string" ? meta.payment_method : "";
    return method.toLowerCase() === "cod";
  }, [order?.metadata]);

  const shiprocketStatus = useMemo(() => {
    const meta = (order?.metadata || {}) as Record<string, unknown>;
    return typeof meta.shiprocket_status === "string" ? meta.shiprocket_status.toLowerCase() : "";
  }, [order?.metadata]);

  const canCancelOrder = useMemo(() => {
    if (!order?.id) return false;
    const blocked = ["picked_up", "in_transit", "out_for_delivery", "delivered", "shipped"];
    const fulfillment = (order?.fulfillment_status || "").toLowerCase();
    if (blocked.includes(shiprocketStatus)) return false;
    if (fulfillment === "shipped" || fulfillment === "delivered") return false;
    const status = (order?.status || "").toLowerCase();
    if (status === "canceled" || status === "cancelled") return false;
    return !existingReturn;
  }, [order?.id, order?.fulfillment_status, order?.status, shiprocketStatus, existingReturn]);

  const resetCancelForm = () => {
    setCancelFormOpen(false);
    setCancelReason("");
    setCustomCancelReason("");
    setCancelError(null);
  };

  const cancelOrder = async () => {
    if (!order?.id || !cancelReason) return;

    const reason =
      cancelReason === CANCELLATION_REASONS[0]
        ? sanitizeTextInput(customCancelReason, 180)
        : cancelReason;

    if (!reason || reason.length < 3) {
      setCancelError("Please provide a cancellation reason.");
      return;
    }

    setCancelSubmitting(true);
    setCancelMessage(null);
    setCancelError(null);
    try {
      const res = await fetch(`/api/medusa/orders/${encodeURIComponent(order.id)}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCancelError(data?.error || "Unable to cancel order.");
        return;
      }
      resetCancelForm();
      setCancelMessage("Order cancelled successfully.");
      await loadOrder(false, false);
    } catch {
      setCancelError("Unable to cancel order.");
    } finally {
      setCancelSubmitting(false);
    }
  };

  const resetReturnForm = () => {
    setReturnFormOpen(false);
    setReturnReason("");
    setReturnNotes("");
    setReturnType("return");
    setReturnError(null);
    setBankDetails({
      account_name: "",
      account_number: "",
      ifsc_code: "",
      bank_name: "",
    });
    if (order?.items?.length) {
      setReturnItems(
        order.items.map((item) => ({
          order_item_id: item.id,
          title: item.title,
          thumbnail: item.thumbnail,
          max: Math.max(1, item.quantity || 1),
          quantity: Math.max(1, item.quantity || 1),
          selected: true,
        }))
      );
    }
  };

  const submitReturnRequest = async () => {
    if (!order?.id) return;
    setReturnError(null);
    setReturnSuccess(null);

    const selected = returnItems.filter((item) => item.selected && item.quantity > 0);
    const safeReason = returnReason ? sanitizeTextInput(returnReason, 180) : "";
    const safeNotes = returnNotes ? sanitizeTextInput(returnNotes, 1000) : "";
    if (!selected.length) {
      setReturnError("Please select at least one item.");
      return;
    }
    if (!safeReason || safeReason.length < 3) {
      setReturnError("Please select a reason for return/exchange.");
      return;
    }

    if (isCod) {
      if (!bankDetails.account_name || !bankDetails.account_number || !bankDetails.ifsc_code) {
        setReturnError("Bank details are required for COD refunds.");
        return;
      }
    }

    setReturnSubmitting(true);
    try {
      const res = await fetch("/api/medusa/return-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.id,
          type: returnType,
          reason: safeReason,
          notes: safeNotes || undefined,
          items: selected.map((item) => ({
            order_item_id: item.order_item_id,
            quantity: item.quantity,
          })),
          bank_details: isCod
            ? {
                account_name: bankDetails.account_name,
                account_number: bankDetails.account_number,
                ifsc_code: bankDetails.ifsc_code,
                bank_name: bankDetails.bank_name || undefined,
              }
            : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReturnError(data?.error || "Unable to submit return request.");
        return;
      }
      setReturnSuccess("Return request submitted. We will update you after approval.");
      resetReturnForm();
      await loadReturnRequests();
    } catch {
      setReturnError("Unable to submit return request.");
    } finally {
      setReturnSubmitting(false);
    }
  };

  const displayTotals = useMemo(() => {
    if (order?.display_totals) return order.display_totals;
    return {
      itemsSubtotal: order?.subtotal || 0,
      shipping: order?.shipping_total || 0,
      coinDiscount: 0,
      oweg10Discount: 0,
      grandTotal: order?.total || 0,
    };
  }, [order?.display_totals, order?.subtotal, order?.shipping_total, order?.total]);

  const steps = useMemo(
    () => trackerSteps(order || undefined, existingReturn || null),
    [order, existingReturn]
  );

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
        <span className="font-semibold text-gray-900">
          {orderNumber ? `Order ${orderNumber}` : "Order details"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {orderNumber ? `Order ${orderNumber}` : "Order details"}
          </h1>
          <p className="text-sm text-gray-600">Placed on {formatDateTime(order?.created_at)}</p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-xs text-gray-500">Order ID</p>
          <p className="text-sm font-semibold text-gray-900 break-all">{order?.id || "..."}</p>
          {loading && (
            <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="grid gap-6">
        <div className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-900">Order tracker</p>
          <div
            className={`grid gap-3 ${
              steps.length <= 2 ? "grid-cols-2" : steps.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-5"
            }`}
          >
            {steps.map((step) => (
              <div key={step.key} className="flex flex-col gap-2 min-w-0">
                <div
                  className={`flex items-center gap-2 text-sm font-semibold ${
                    step.tone === "cancelled"
                      ? "text-rose-700"
                      : step.active
                        ? "text-emerald-700"
                        : "text-gray-500"
                  }`}
                >
                  <step.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{step.label}</span>
                </div>
                <div
                  className={`h-1 rounded-full ${
                    step.tone === "cancelled"
                      ? "bg-rose-500"
                      : step.active
                        ? "bg-emerald-500"
                        : "bg-gray-200"
                  }`}
                />
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
              Total: {formatCurrency(displayTotals.grandTotal, order?.currency_code)}
            </span>
            <span className="inline-flex items-center gap-2 text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">
              Payment: {order?.payment_status || "pending"}
            </span>
            <span className="inline-flex items-center gap-2 text-xs bg-gray-100 text-gray-800 px-3 py-1 rounded-full">
              Fulfillment: {order?.fulfillment_status || "processing"}
            </span>
          </div>

          {(displayTotals.itemsSubtotal > 0 || displayTotals.shipping > 0) && (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700 space-y-1">
              <div className="flex justify-between gap-3">
                <span>Items</span>
                <span>{formatCurrency(displayTotals.itemsSubtotal, order?.currency_code)}</span>
              </div>
              {displayTotals.shipping > 0 && (
                <div className="flex justify-between gap-3">
                  <span>Shipping</span>
                  <span>{formatCurrency(displayTotals.shipping, order?.currency_code)}</span>
                </div>
              )}
              {displayTotals.oweg10Discount > 0 && (
                <div className="flex justify-between gap-3 text-emerald-700">
                  <span>OWEG10 discount</span>
                  <span>-{formatCurrency(displayTotals.oweg10Discount, order?.currency_code)}</span>
                </div>
              )}
              {displayTotals.coinDiscount > 0 && (
                <div className="flex justify-between gap-3 text-emerald-700">
                  <span>Coins applied</span>
                  <span>-{formatCurrency(displayTotals.coinDiscount, order?.currency_code)}</span>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-gray-200 pt-2 font-semibold text-gray-900">
                <span>Total</span>
                <span>{formatCurrency(displayTotals.grandTotal, order?.currency_code)}</span>
              </div>
            </div>
          )}

          {cancelMessage && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 text-gray-700 px-4 py-3 text-sm font-semibold">
              {cancelMessage}
            </div>
          )}

          {canCancelOrder && (
            <Button
              variant="secondary"
              className="w-full sm:w-auto bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 hover:text-rose-800 transition-all duration-200 cursor-pointer [&_svg]:transition-transform hover:[&_svg]:rotate-6 hover:[&_svg]:scale-105"
              onClick={() => {
                setCancelFormOpen(true);
                setCancelError(null);
              }}
              disabled={cancelSubmitting}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel order
            </Button>
          )}

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
                    {formatCurrency(item.total ?? (item.unit_price || 0) * (item.quantity || 1), order?.currency_code)}
                  </div>
                </div>
              ))}
              {!order?.items?.length && <div className="p-3 text-sm text-gray-600">No items</div>}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Return or replacement</p>
              <p className="text-xs text-gray-500">
                {deliveryDate
                  ? `Return window closes on ${formatDateTime(returnDeadline?.toISOString())}`
                  : "Return window starts after delivery confirmation."}
              </p>
            </div>
            {existingReturn ? (
              <span className="inline-flex items-center gap-2 text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">
                {existingReturn.type} request: {existingReturn.status}
              </span>
            ) : null}
          </div>

          {returnSuccess && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700 px-4 py-3 text-sm font-semibold">
              {returnSuccess}
            </div>
          )}
          {returnError && (
            <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
              {returnError}
            </div>
          )}

          {!existingReturn && withinReturnWindow && !returnFormOpen && (
            <Button
              className="w-full sm:w-auto bg-emerald-600 text-white hover:bg-emerald-700 transition-all duration-200 cursor-pointer [&_svg]:transition-transform hover:[&_svg]:-rotate-12 hover:[&_svg]:scale-105"
              onClick={() => {
                setReturnFormOpen(true);
                setReturnError(null);
                setReturnSuccess(null);
              }}
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Request return or replacement
            </Button>
          )}

          {!existingReturn && !withinReturnWindow && (
            <p className="text-sm text-gray-600">
              Return requests are available for 7 days after delivery.
            </p>
          )}

          {returnFormOpen && !existingReturn && (
            <ReturnOrderPanel
              open={returnFormOpen}
              orderNumber={orderNumber}
              returnType={returnType}
              onReturnTypeChange={setReturnType}
              orderItems={order?.items || []}
              returnItems={returnItems}
              onReturnItemsChange={setReturnItems}
              currencyCode={order?.currency_code}
              selectedReason={returnReason}
              onReasonChange={setReturnReason}
              notes={returnNotes}
              onNotesChange={(value) => setReturnNotes(sanitizeTextInput(value, 1000))}
              isCod={isCod}
              bankDetails={bankDetails}
              onBankDetailsChange={setBankDetails}
              submitting={returnSubmitting}
              error={returnError}
              onClose={resetReturnForm}
              onSubmit={() => void submitReturnRequest()}
            />
          )}
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
            Need help? Call +91 8797787877 or email owegonline@oweg.in
          </div>
        </div>

        <CancelOrderPanel
          open={cancelFormOpen}
          items={order?.items || []}
          currencyCode={order?.currency_code}
          selectedReason={cancelReason}
          customReason={customCancelReason}
          submitting={cancelSubmitting}
          error={cancelError}
          onReasonChange={setCancelReason}
          onCustomReasonChange={(value) => setCustomCancelReason(sanitizeTextInput(value, 180))}
          onClose={resetCancelForm}
          onSubmit={() => void cancelOrder()}
        />

      </div>
    </div>
  );
}

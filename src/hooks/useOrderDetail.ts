"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CANCELLATION_REASONS } from "@/components/orders/CancelOrderPanel";
import type { ReturnItemForm } from "@/components/orders/ReturnOrderPanel";
import { useAuth } from "@/contexts/AuthProvider";
import {
  canCancelOrder,
  getDeliveryDate,
  getReturnDeadline,
  isCodOrder,
  isWithinReturnWindow,
  trackerSteps,
} from "@/lib/order-tracker";
import type { OrderDetail, ReturnRequest } from "@/lib/order-types";
import { sanitizeTextInput } from "@/lib/order-utils";

export function useOrderDetail(orderId?: string) {
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

  const existingReturn = useMemo(
    () => returnRequests.find((req) => req.order_id === order?.id),
    [returnRequests, order?.id]
  );

  const deliveryDate = useMemo(() => getDeliveryDate(order), [order]);
  const returnDeadline = useMemo(() => getReturnDeadline(order), [order]);
  const withinReturnWindow = useMemo(() => isWithinReturnWindow(order), [order]);
  const isCod = useMemo(() => isCodOrder(order), [order]);

  const shiprocketStatus = useMemo(() => {
    const meta = (order?.metadata || {}) as Record<string, unknown>;
    return typeof meta.shiprocket_status === "string" ? meta.shiprocket_status.toLowerCase() : "";
  }, [order?.metadata]);

  const canCancel = useMemo(
    () => canCancelOrder(order, existingReturn, shiprocketStatus),
    [order, existingReturn, shiprocketStatus]
  );

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
    () => trackerSteps(order, existingReturn || null),
    [order, existingReturn]
  );

  const resetCancelForm = useCallback(() => {
    setCancelFormOpen(false);
    setCancelReason("");
    setCustomCancelReason("");
    setCancelError(null);
  }, []);

  const cancelOrder = useCallback(async () => {
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
  }, [order?.id, cancelReason, customCancelReason, loadOrder, resetCancelForm]);

  const resetReturnForm = useCallback(() => {
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
  }, [order?.items]);

  const submitReturnRequest = useCallback(async () => {
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
  }, [
    order?.id,
    returnItems,
    returnReason,
    returnNotes,
    isCod,
    bankDetails,
    returnType,
    resetReturnForm,
    loadReturnRequests,
  ]);

  return {
    customer,
    order,
    loading,
    error,
    existingReturn,
    deliveryDate,
    returnDeadline,
    withinReturnWindow,
    isCod,
    canCancel,
    displayTotals,
    steps,
    cancelFormOpen,
    setCancelFormOpen,
    cancelReason,
    setCancelReason,
    customCancelReason,
    setCustomCancelReason,
    cancelSubmitting,
    cancelMessage,
    cancelError,
    resetCancelForm,
    cancelOrder,
    returnFormOpen,
    setReturnFormOpen,
    returnType,
    setReturnType,
    returnReason,
    setReturnReason,
    returnNotes,
    setReturnNotes,
    returnItems,
    setReturnItems,
    returnError,
    returnSuccess,
    returnSubmitting,
    bankDetails,
    setBankDetails,
    resetReturnForm,
    submitReturnRequest,
    refreshOrder: () => loadOrder(false, true),
  };
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight, Package } from "lucide-react";
import BrandLoader from "@/components/ui/BrandLoader";
import { toast } from "sonner";
import OrderBreadcrumbs from "@/components/orders/OrderBreadcrumbs";
import OrderDetailStatusSection from "@/components/orders/OrderDetailStatusSection";
import OrderReplacementChoices from "@/components/orders/OrderReplacementChoices";
import { CancelOrderPanel } from "@/components/orders/CancelOrderPanel";
import { ReturnOrderPanel } from "@/components/orders/ReturnOrderPanel";
import OrderDetailsIcon, {
  getOrderPaymentIconName,
} from "@/components/ui/icons/order-details/OrderDetailsIcon";
import { useAddToCart } from "@/hooks/useCartMutations";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { getOrderCardActions } from "@/lib/order-actions";
import { resolveOrderBucket } from "@/hooks/useAccountOrdersSummary";
import { getCurrentTrackerStepLabel } from "@/lib/order-tracker";
import {
  buildTrackHref,
  buildOrderItemProductHref,
  buildOrderItemReviewHref,
  formatOrderCurrency,
  formatOrderDateTime,
  formatShippingAddress,
  getGoogleMapsUrl,
  getOrderDisplayLabel,
  getPaymentMethodDisplayName,
  getPaymentMethodLabel,
  getShiprocketAwb,
  isPaymentPending,
  resolveOrderLineItemsForCart,
  sanitizeTextInput,
} from "@/lib/order-utils";
import { cn } from "@/lib/utils";

type OrderDetailContentProps = {
  orderId: string;
  orderNumber?: number | null;
  initialAction?: "cancel" | "return" | null;
};

function SummaryCard({
  icon,
  title,
  value,
  badge,
  action,
  tone = "green",
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "green" | "amber";
}) {
  const iconWell =
    tone === "amber" ? "bg-amber-50" : "bg-slate-50";
  const valueClass =
    tone === "amber" ? "text-amber-800" : "text-slate-900";

  return (
    <div className="min-w-0 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&>img]:h-4 [&>img]:w-4 ${iconWell}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className={`text-balance text-xs font-semibold leading-relaxed ${valueClass}`}>{value}</p>
            {badge}
          </div>
          {action ? <div className="mt-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

const ACTIVE_RETURN_STATUSES = new Set([
  "pending_approval",
  "approved",
  "pickup_initiated",
  "picked_up",
  "received",
]);

function ActionTile({
  icon,
  label,
  subtext,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  subtext?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-3 text-left focus-visible:outline-2 focus-visible:outline-green-700 sm:px-3",
        disabled ? "cursor-not-allowed text-slate-600" : "text-slate-900 hover:bg-slate-50"
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {subtext ? <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{subtext}</span> : null}
      </span>
      {!disabled && <ChevronRight className="size-4 shrink-0 text-slate-500" aria-hidden />}
    </button>
  );
}

function OrderItemThumbnail({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 sm:h-20 sm:w-20">
      {src && !failed ? (
        <Image src={src} alt="" fill sizes="80px" className="object-contain p-2" onError={() => setFailed(true)} />
      ) : (
        <Package className="h-7 w-7 text-slate-300" aria-hidden />
      )}
    </div>
  );
}

export default function OrderDetailContent({
  orderId,
  orderNumber,
  initialAction = null,
}: OrderDetailContentProps) {
  const detail = useOrderDetail(orderId);
  const addToCart = useAddToCart();
  const [buyAgainPending, setBuyAgainPending] = useState(false);
  const initialActionHandledRef = useRef(false);
  const itemsRef = useRef<HTMLHeadingElement>(null);

  const {
    order,
    loading,
    error,
    existingReturn,
    withinReturnWindow,
    requireCancelRefundPayout,
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
    cancelPayoutMethod,
    setCancelPayoutMethod,
    cancelUpiId,
    setCancelUpiId,
    cancelBankDetails,
    setCancelBankDetails,
    returnFormOpen,
    setReturnFormOpen,
    returnType,
    setReturnType,
    returnReason,
    setReturnReason,
    returnNotes,
    returnPhotos,
    setReturnPhotos,
    setReturnNotes,
    returnItems,
    setReturnItems,
    returnError,
    returnSuccess,
    returnSubmitting,
    bankDetails,
    setBankDetails,
    payoutMethod,
    setPayoutMethod,
    upiId,
    setUpiId,
    resetReturnForm,
    submitReturnRequest,
  } = detail;
  const canReviewItems = Boolean(order && resolveOrderBucket(order) === "delivered");

  useEffect(() => {
    if (!order?.id || window.location.hash !== "#order-items") return;
    itemsRef.current?.focus({ preventScroll: true });
    itemsRef.current?.scrollIntoView({ block: "start" });
  }, [order?.id]);

  useEffect(() => {
    if (!order || !initialAction || initialActionHandledRef.current) return;
    initialActionHandledRef.current = true;
    if (initialAction === "cancel" && canCancel) {
      setCancelFormOpen(true);
    }
    if (initialAction === "return" && withinReturnWindow && !existingReturn) {
      setReturnFormOpen(true);
    }
  }, [
    order,
    initialAction,
    canCancel,
    withinReturnWindow,
    existingReturn,
    setCancelFormOpen,
    setReturnFormOpen,
  ]);

  const displayLabel = getOrderDisplayLabel(order, orderNumber);
  const awb = getShiprocketAwb(order);
  const trackHref = buildTrackHref(orderId, order?.display_id ?? orderNumber);
  const address = order?.shipping_address;
  const mapsUrl = getGoogleMapsUrl(address);
  const cardActions = useMemo(
    () => (order ? getOrderCardActions(order, existingReturn) : null),
    [order, existingReturn]
  );
  const buyAgainItems = useMemo(() => resolveOrderLineItemsForCart(order), [order]);
  const currentStatusLabel = getCurrentTrackerStepLabel(steps);
  const itemCount = order?.items?.length || 0;
  const showPaymentPending = isPaymentPending(order);
  const isCancelledOrder =
    String(order?.status || "").toLowerCase() === "canceled" ||
    String(order?.status || "").toLowerCase() === "cancelled";
  const cancelMeta = (order?.metadata || {}) as Record<string, unknown>;
  const adminCancelled =
    cancelMeta.cancelled_by_admin === true ||
    cancelMeta.cancellation_source === "admin" ||
    cancelMeta.cancelled_by === "admin";
  // Customer-facing cancel message only (vendor notes are stripped in normalizeOrderForCustomer).
  const cancellationNote =
    (typeof cancelMeta.customer_cancel_reason === "string" &&
      cancelMeta.customer_cancel_reason.trim()) ||
    (typeof cancelMeta.cancellation_reason === "string" &&
      cancelMeta.cancellation_reason.trim()) ||
    "";
  const isActiveReturn = Boolean(
    existingReturn && ACTIVE_RETURN_STATUSES.has(String(existingReturn.status || "").toLowerCase())
  );
  const statusCardTone = isCancelledOrder ? "amber" : isActiveReturn ? "amber" : "green";
  const statusCardIcon = isActiveReturn ? (
    <OrderDetailsIcon name="return-replace" size={24} className="h-6 w-6" />
  ) : (
    <OrderDetailsIcon name="order-status" size={24} className="h-6 w-6" />
  );

  const [invoicePending, setInvoicePending] = useState(false);

  const handleInvoiceClick = async () => {
    if (!order?.id || invoicePending) return;
    setInvoicePending(true);
    try {
      const res = await fetch(
        `/api/medusa/orders/${encodeURIComponent(order.id)}/invoice`,
        { method: "GET", credentials: "include" }
      );
      if (!res.ok) {
        let message = "Could not download invoice";
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const filenameMatch = /filename="?([^"]+)"?/i.exec(
        res.headers.get("Content-Disposition") || ""
      );
      const filename =
        filenameMatch?.[1] ||
        `Invoice-OWEG-${order.display_id || order.id}.pdf`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Invoice downloaded");
    } catch (err: any) {
      toast.error(err?.message || "Could not download invoice");
    } finally {
      setInvoicePending(false);
    }
  };

  const handleCopyId = async () => {
    const value = String(order?.display_id ?? order?.id ?? "");
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  const handleBuyAgain = async () => {
    if (!buyAgainItems.length || buyAgainPending || addToCart.isPending) return;
    setBuyAgainPending(true);
    try {
      for (const item of buyAgainItems) {
        await addToCart.mutateAsync(item);
      }
      toast.success(
        buyAgainItems.length > 1 ? "All items added to cart" : "Added to cart"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add to cart";
      toast.error(message);
    } finally {
      setBuyAgainPending(false);
    }
  };

  if (loading && !order) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <BrandLoader compact label="Loading your order details…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OrderBreadcrumbs
        items={[
          { label: "Orders", href: "/account/orders" },
          { label: "Order Details" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#326b29]">Your purchase</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Order Details</h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 sm:text-sm">
            Order {displayLabel} · Placed {formatOrderDateTime(order?.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {order?.id ? (
            <button
              type="button"
              onClick={() => void handleCopyId()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:border-green-200 hover:text-green-800"
            >
              <OrderDetailsIcon name="copy-id" size={16} className="h-4 w-4" />
              Copy ID
            </button>
          ) : null}
          <Link
            href={trackHref}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#326b29] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#285722]"
          >
            <OrderDetailsIcon name="track-order" size={16} className="h-4 w-4 brightness-0 invert" />
            Track Order
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {cancelMessage ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-slate-900">
          {cancelMessage}
        </div>
      ) : null}

      <OrderReplacementChoices orderId={orderId} onOrderChanged={() => void detail.refreshOrder()} />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 lg:grid-cols-4">
        <SummaryCard
          icon={<OrderDetailsIcon name="order-placed-calendar" size={24} className="h-6 w-6" />}
          title="Order Placed"
          value={formatOrderDateTime(order?.created_at) || "—"}
        />
        <SummaryCard
          icon={
            <OrderDetailsIcon
              name={getOrderPaymentIconName(order)}
              size={24}
              className="h-6 w-6"
            />
          }
          title="Payment Method"
          value={getPaymentMethodDisplayName(order)}
          badge={
            showPaymentPending ? (
              <span className="rounded-full bg-[#EAF8E7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#326b29]">
                Pending
              </span>
            ) : null
          }
        />
        <SummaryCard
          icon={<OrderDetailsIcon name="total-amount" size={24} className="h-6 w-6" />}
          title="Total Amount"
          value={formatOrderCurrency(displayTotals.grandTotal, order?.currency_code)}
          action={
            <button
              type="button"
              disabled={invoicePending}
              onClick={() => void handleInvoiceClick()}
              className="text-xs font-semibold text-[#326b29] hover:underline disabled:opacity-50"
            >
              {invoicePending ? "Downloading…" : "Download Invoice"}
            </button>
          }
        />
        <SummaryCard
          icon={statusCardIcon}
          title="Order Status"
          value={currentStatusLabel}
          tone={statusCardTone}
          action={
            <a
              href="#order-status-timeline"
              className={`text-xs font-semibold hover:underline ${
                isActiveReturn ? "text-[#B54708]" : "text-[#326b29]"
              }`}
            >
              View Timeline
            </a>
          }
        />
      </div>

      {isCancelledOrder ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 shadow-sm sm:px-5">
          <p className="text-sm font-semibold text-[#D92D20]">
            {adminCancelled
              ? "OWEG has cancelled your order."
              : "This order has been cancelled."}
          </p>
          {cancellationNote ? (
            <p className="mt-1 text-sm leading-relaxed text-[#7A271A]">
              {adminCancelled ? "Message from OWEG: " : "Reason: "}
              {cancellationNote}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-[#B42318]">
            {adminCancelled
              ? "We emailed you this message. Refunds for prepaid orders are processed separately."
              : "If you paid online, the refund follows the details you submitted."}
          </p>
        </div>
      ) : null}

      <OrderDetailStatusSection
        id="order-status-timeline"
        order={order}
        steps={steps}
        existingReturn={existingReturn}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <OrderDetailsIcon name="delivery-address" size={18} className="h-[18px] w-[18px]" />
              <p className="text-sm font-semibold text-slate-900">Delivery address</p>
            </div>
            <Link
              href="/account/addresses"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#326b29] hover:underline"
            >
              <OrderDetailsIcon name="change" size={14} className="h-3.5 w-3.5" />
              Change
            </Link>
          </div>
          <p className="text-sm font-medium text-slate-900">
            {address?.first_name} {address?.last_name}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{formatShippingAddress(address)}</p>
          {address?.phone ? <p className="mt-2 text-sm text-slate-500">{address.phone}</p> : null}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#326b29] hover:underline"
          >
            <OrderDetailsIcon name="open-in-maps" size={14} className="h-3.5 w-3.5" />
            Open in Maps
          </a>
          {existingReturn && existingReturn.type === "return" ? (
            <div className="mt-4 rounded-xl border border-amber-100 bg-[#FFF4E5] px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#B54708]">
                Refund payout on file
              </p>
              <p className="mt-1 text-sm text-slate-900">
                {existingReturn.refund_method === "upi" ||
                existingReturn.metadata?.payout_method === "upi"
                  ? `UPI: ${existingReturn.metadata?.upi_masked || "Submitted"}`
                  : existingReturn.bank_account_last4 ||
                      existingReturn.metadata?.bank_account_last4
                    ? `Bank account ending ${
                        existingReturn.bank_account_last4 ||
                        existingReturn.metadata?.bank_account_last4
                      }`
                    : "Submitted for admin refund processing"}
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <OrderDetailsIcon name="delivery-partner" size={18} className="h-[18px] w-[18px]" />
            <h2 className="text-sm font-semibold text-slate-900">Delivery tracking</h2>
          </div>
          <p className="break-words text-sm text-slate-600">
            {awb ? `Tracking reference: ${awb}` : "See the latest updates for this order."}
          </p>
          {awb || cardActions?.showTrack ? (
            <Link
              href={trackHref}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#145448] hover:underline focus-visible:outline-2 focus-visible:outline-green-700"
            >
              View tracking <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Need Help with your order?</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Our support team is here to assist you.
              </p>
              <Link
                href="/account/help"
                className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:border-green-200 hover:text-green-800"
              >
                <OrderDetailsIcon name="contact-support" size={16} className="h-4 w-4" />
                Contact Support
              </Link>
            </div>
            <Image
              src="/images/order-details/help-support-illustration.png"
              alt=""
              width={96}
              height={96}
              className="hidden h-24 w-24 shrink-0 object-contain sm:block"
              aria-hidden
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <OrderDetailsIcon name="product-item" size={18} className="h-[18px] w-[18px]" />
          <h2 id="order-items" ref={itemsRef} tabIndex={-1} className="scroll-mt-[calc(var(--app-header-height,136px)+1rem)] text-sm font-semibold text-slate-900">Order Items ({itemCount})</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {(order?.items || []).map((item) => {
            const productHref = buildOrderItemProductHref(item);
            const reviewHref = canReviewItems
              ? buildOrderItemReviewHref(item)
              : null;
            const summary = (
              <>
                <OrderItemThumbnail src={item.thumbnail} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-900 group-hover:text-[#145448] group-hover:underline">{item.title || "Order item"}</p>
                  <p className="mt-1.5 text-xs text-slate-600">Qty: {item.quantity}</p>
                </div>
              </>
            );
            return <div key={item.id} className="flex items-start gap-3 py-4 sm:gap-4">
              <div className="min-w-0 flex-1">
              {productHref ? (
                <Link href={productHref} prefetch={false} className="group flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700">{summary}</Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-start gap-3">{summary}</div>
              )}
              {reviewHref && (
                <Link href={reviewHref} prefetch={false} aria-label={`Rate & review ${item.title || "order item"}`} className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-[#145448]/25 px-3 text-sm font-semibold text-[#145448] hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-offset-2">
                  Rate &amp; review
                </Link>
              )}
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                {formatOrderCurrency(
                  item.total ?? (item.unit_price || 0) * (item.quantity || 1),
                  order?.currency_code
                )}
              </p>
            </div>
          })}
          {!order?.items?.length ? (
            <p className="p-4 text-sm text-slate-500">No items found.</p>
          ) : null}
        </div>
      </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <OrderDetailsIcon name="price-summary" size={18} className="h-[18px] w-[18px]" />
            <p className="text-sm font-semibold text-slate-900">Price Summary</p>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between gap-3">
              <span>Price ({itemCount} item{itemCount === 1 ? "" : "s"})</span>
              <span>{formatOrderCurrency(displayTotals.itemsSubtotal, order?.currency_code)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Shipping Fee</span>
              <span className={displayTotals.shipping > 0 ? undefined : "font-semibold text-[#326b29]"}>
                {displayTotals.shipping > 0
                  ? formatOrderCurrency(displayTotals.shipping, order?.currency_code)
                  : "FREE"}
              </span>
            </div>
            {displayTotals.oweg10Discount > 0 ? (
              <div className="flex justify-between gap-3 text-[#326b29]">
                <span>OWEG10 Discount</span>
                <span>-{formatOrderCurrency(displayTotals.oweg10Discount, order?.currency_code)}</span>
              </div>
            ) : null}
            {displayTotals.promoDiscount > 0 ? (
              <div className="flex justify-between gap-3 text-[#326b29]">
                <span>
                  {displayTotals.promoCode
                    ? `${displayTotals.promoCode} Discount`
                    : "Promo Discount"}
                </span>
                <span>-{formatOrderCurrency(displayTotals.promoDiscount, order?.currency_code)}</span>
              </div>
            ) : null}
            {displayTotals.coinDiscount > 0 ? (
              <div className="flex justify-between gap-3 text-[#326b29]">
                <span>Coin Discount</span>
                <span>-{formatOrderCurrency(displayTotals.coinDiscount, order?.currency_code)}</span>
              </div>
            ) : null}
            <div className="border-t border-slate-200 pt-3">
              <div className="flex justify-between gap-3 text-base font-semibold text-slate-900">
                <span>Total Amount</span>
                <span>{formatOrderCurrency(displayTotals.grandTotal, order?.currency_code)}</span>
              </div>
              <p className="mt-2 text-xs text-slate-600">Payment · {getPaymentMethodLabel(order)}</p>
            </div>
          </div>
        </div>

      <section aria-labelledby="manage-order-title" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 id="manage-order-title" className="border-b border-slate-100 pb-3 text-sm font-semibold text-slate-900">Manage this order</h2>
        <div className="divide-y divide-slate-100">
          <ActionTile
            icon={<OrderDetailsIcon name="download-invoice" size={18} className="size-[18px]" />}
            label={invoicePending ? "Downloading…" : "Download invoice"}
            disabled={invoicePending}
            onClick={() => void handleInvoiceClick()}
          />
          <ActionTile
            icon={<OrderDetailsIcon name="return-replace" size={18} className="size-[18px]" />}
            label="Return or replace"
            subtext={
              cardActions?.showReturn
                ? undefined
                : existingReturn
                  ? `${existingReturn.type} request: ${existingReturn.status}`
                  : "Currently unavailable for this order"
            }
            disabled={!cardActions?.showReturn}
            onClick={() => setReturnFormOpen(true)}
          />
          <ActionTile
            icon={<OrderDetailsIcon name="buy-again" size={18} className="size-[18px]" />}
            label={buyAgainPending ? "Adding to cart…" : "Buy again"}
            disabled={!buyAgainItems.length || buyAgainPending || addToCart.isPending}
            onClick={() => void handleBuyAgain()}
          />
          <ActionTile
            icon={<OrderDetailsIcon name="cancel-order" size={18} className="size-[18px]" />}
            label="Cancel order"
            subtext={!canCancel ? "Currently unavailable for this order" : undefined}
            disabled={!canCancel}
            onClick={() => setCancelFormOpen(true)}
          />
        </div>

        {returnSuccess ? (
          <p role="status" className="mt-4 text-sm font-semibold text-[#326b29]">{returnSuccess}</p>
        ) : null}
        {returnError ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-[#D92D20]">{returnError}</p>
        ) : null}
      </section>

      <Link
        href="/account/orders"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#326b29] hover:underline"
      >
        <OrderDetailsIcon name="back-to-orders" size={16} className="h-4 w-4" />
        Back to Orders
      </Link>

      <CancelOrderPanel
        open={cancelFormOpen}
        items={order?.items || []}
        currencyCode={order?.currency_code}
        selectedReason={cancelReason}
        customReason={customCancelReason}
        requireRefundPayout={requireCancelRefundPayout}
        payoutMethod={cancelPayoutMethod}
        onPayoutMethodChange={setCancelPayoutMethod}
        upiId={cancelUpiId}
        onUpiIdChange={setCancelUpiId}
        bankDetails={cancelBankDetails}
        onBankDetailsChange={setCancelBankDetails}
        submitting={cancelSubmitting}
        error={cancelError}
        onReasonChange={setCancelReason}
        onCustomReasonChange={(value) => setCustomCancelReason(sanitizeTextInput(value, 180))}
        onClose={resetCancelForm}
        onSubmit={() => void cancelOrder()}
      />

      {returnFormOpen && !existingReturn ? (
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
          photos={returnPhotos}
          onPhotosChange={setReturnPhotos}
          onNotesChange={(value) => setReturnNotes(sanitizeTextInput(value, 1000))}
          payoutMethod={payoutMethod}
          onPayoutMethodChange={setPayoutMethod}
          upiId={upiId}
          onUpiIdChange={setUpiId}
          bankDetails={bankDetails}
          onBankDetailsChange={setBankDetails}
          submitting={returnSubmitting}
          error={returnError}
          onClose={resetReturnForm}
          onSubmit={() => void submitReturnRequest()}
        />
      ) : null}
    </div>
  );
}

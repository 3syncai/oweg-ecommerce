"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import OrderBreadcrumbs from "@/components/orders/OrderBreadcrumbs";
import OrderDetailStatusSection from "@/components/orders/OrderDetailStatusSection";
import { CancelOrderPanel } from "@/components/orders/CancelOrderPanel";
import { ReturnOrderPanel } from "@/components/orders/ReturnOrderPanel";
import OrderDetailsIcon, {
  getOrderPaymentIconName,
} from "@/components/ui/icons/order-details/OrderDetailsIcon";
import { useAddToCart } from "@/hooks/useCartMutations";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { getOrderCardActions } from "@/lib/order-actions";
import { getCurrentTrackerStepLabel } from "@/lib/order-tracker";
import {
  buildTrackHref,
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
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF8E7]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[#1F2A33]">{value}</p>
            {badge}
          </div>
          {action ? <div className="mt-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

function ActionTile({
  icon,
  label,
  subtext,
  tone,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  subtext?: string;
  tone: "red" | "green" | "orange" | "blue";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const toneClasses = {
    red: "border-red-100 bg-red-50/50 text-[#D92D20] hover:bg-red-50",
    green: "border-[#66C940]/20 bg-[#EAF8E7]/60 text-[#1F2A33] hover:bg-[#EAF8E7]",
    orange: "border-orange-100 bg-orange-50/50 text-[#F79009] hover:bg-orange-50",
    blue: "border-blue-100 bg-blue-50/50 text-[#175CD3] hover:bg-blue-50",
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border px-4 py-5 text-center transition",
        toneClasses[tone],
        disabled && "cursor-not-allowed opacity-50 hover:bg-inherit"
      )}
    >
      {icon}
      <span className="text-sm font-semibold">{label}</span>
      {subtext ? <span className="text-xs text-gray-500">{subtext}</span> : null}
    </button>
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

  const {
    order,
    loading,
    error,
    existingReturn,
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
  } = detail;

  useEffect(() => {
    if (!order || !initialAction) return;
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

  const handleInvoiceClick = () => {
    toast.info("Your invoice was emailed when the order was placed.");
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
        <Loader2 className="h-8 w-8 animate-spin text-[#66C940]" />
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
          <h1 className="text-xl font-semibold text-[#1F2A33] md:text-2xl">Order Details</h1>
          <p className="mt-1 text-sm text-gray-500">
            Order {displayLabel} · Placed {formatOrderDateTime(order?.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {order?.id ? (
            <button
              type="button"
              onClick={() => void handleCopyId()}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#1F2A33] transition hover:border-[#66C940]/40"
            >
              <OrderDetailsIcon name="copy-id" size={16} className="h-4 w-4" />
              Copy ID
            </button>
          ) : null}
          <Link
            href={trackHref}
            className="inline-flex items-center gap-2 rounded-full bg-[#66C940] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5ab838]"
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
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-[#1F2A33]">
          {cancelMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              <span className="rounded-full bg-[#EAF8E7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#66C940]">
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
              onClick={handleInvoiceClick}
              className="text-xs font-semibold text-[#66C940] hover:underline"
            >
              View Invoice
            </button>
          }
        />
        <SummaryCard
          icon={<OrderDetailsIcon name="order-status" size={24} className="h-6 w-6" />}
          title="Order Status"
          value={currentStatusLabel}
          action={
            <a
              href="#order-status-timeline"
              className="text-xs font-semibold text-[#66C940] hover:underline"
            >
              View Timeline
            </a>
          }
        />
      </div>

      <OrderDetailStatusSection id="order-status-timeline" order={order} steps={steps} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <OrderDetailsIcon name="delivery-address" size={18} className="h-[18px] w-[18px]" />
              <p className="text-sm font-semibold text-[#1F2A33]">Delivered to</p>
            </div>
            <Link
              href="/account/addresses"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#66C940] hover:underline"
            >
              <OrderDetailsIcon name="change" size={14} className="h-3.5 w-3.5" />
              Change
            </Link>
          </div>
          <p className="text-sm font-medium text-[#1F2A33]">
            {address?.first_name} {address?.last_name}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{formatShippingAddress(address)}</p>
          {address?.phone ? <p className="mt-2 text-sm text-gray-500">{address.phone}</p> : null}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#66C940] hover:underline"
          >
            <OrderDetailsIcon name="open-in-maps" size={14} className="h-3.5 w-3.5" />
            Open in Maps
          </a>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <OrderDetailsIcon name="delivery-partner" size={18} className="h-[18px] w-[18px]" />
            <p className="text-sm font-semibold text-[#1F2A33]">Delivery Partner</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF8E7]">
              <OrderDetailsIcon name="delivery-partner" size={24} className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1F2A33]">Shiprocket</p>
              <p className="text-xs text-gray-500">
                {awb ? `Tracking ID: ${awb}` : "Tracking will appear once shipped"}
              </p>
            </div>
          </div>
          {awb ? (
            <Link
              href={trackHref}
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#66C940] hover:underline"
            >
              View Tracking
            </Link>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-2xl border border-orange-100 bg-orange-50/60 p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#1F2A33]">Need Help with your order?</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">
                Our support team is here to assist you.
              </p>
              <Link
                href="/account/help"
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-semibold text-[#1F2A33] transition hover:border-[#66C940]/30"
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

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <OrderDetailsIcon name="product-item" size={18} className="h-[18px] w-[18px]" />
          <p className="text-sm font-semibold text-[#1F2A33]">Order Items ({itemCount})</p>
        </div>
        <div className="divide-y rounded-xl border border-gray-100">
          {(order?.items || []).map((item) => (
            <div key={item.id} className="flex gap-3 p-3 sm:p-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-50">
                {item.thumbnail ? (
                  <Image src={item.thumbnail} alt={item.title || "Item"} fill className="object-contain" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1F2A33]">{item.title}</p>
                <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
              </div>
              <p className="text-sm font-semibold text-[#1F2A33]">
                {formatOrderCurrency(
                  item.total ?? (item.unit_price || 0) * (item.quantity || 1),
                  order?.currency_code
                )}
              </p>
            </div>
          ))}
          {!order?.items?.length ? (
            <p className="p-4 text-sm text-gray-500">No items found.</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <OrderDetailsIcon name="price-summary" size={18} className="h-[18px] w-[18px]" />
            <p className="text-sm font-semibold text-[#1F2A33]">Price Summary</p>
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex justify-between gap-3">
              <span>Price ({itemCount} item{itemCount === 1 ? "" : "s"})</span>
              <span>{formatOrderCurrency(displayTotals.itemsSubtotal, order?.currency_code)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Shipping Fee</span>
              <span className={displayTotals.shipping > 0 ? undefined : "font-semibold text-[#66C940]"}>
                {displayTotals.shipping > 0
                  ? formatOrderCurrency(displayTotals.shipping, order?.currency_code)
                  : "FREE"}
              </span>
            </div>
            {displayTotals.oweg10Discount > 0 ? (
              <div className="flex justify-between gap-3 text-[#66C940]">
                <span>OWEG10 Discount</span>
                <span>-{formatOrderCurrency(displayTotals.oweg10Discount, order?.currency_code)}</span>
              </div>
            ) : null}
            {displayTotals.coinDiscount > 0 ? (
              <div className="flex justify-between gap-3 text-[#66C940]">
                <span>Discount</span>
                <span>-{formatOrderCurrency(displayTotals.coinDiscount, order?.currency_code)}</span>
              </div>
            ) : null}
            <div className="border-t border-dashed border-gray-200 pt-3">
              <div className="flex justify-between gap-3 text-base font-semibold text-[#1F2A33]">
                <span>Total Amount</span>
                <span>{formatOrderCurrency(displayTotals.grandTotal, order?.currency_code)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">(Paid via {getPaymentMethodLabel(order)})</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#66C940]/20 bg-[#EAF8E7]/40 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col items-center text-center">
            <OrderDetailsIcon name="safe-secure-shield" size={40} className="h-10 w-10" />
            <p className="mt-3 text-sm font-semibold text-[#1F2A33]">Safe & Secure</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">
              Your payment is safe with us.
            </p>
            <Image
              src="/images/order-details/safe-secure-illustration.png"
              alt=""
              width={120}
              height={120}
              className="mt-3 h-28 w-28 object-contain"
              aria-hidden
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
        <p className="mb-4 text-sm font-semibold text-[#1F2A33]">What would you like to do?</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ActionTile
            icon={<OrderDetailsIcon name="cancel-order" size={28} className="h-7 w-7" />}
            label="Cancel Order"
            tone="red"
            disabled={!canCancel}
            onClick={() => setCancelFormOpen(true)}
          />
          <ActionTile
            icon={<OrderDetailsIcon name="download-invoice" size={28} className="h-7 w-7" />}
            label="Download Invoice"
            tone="green"
            onClick={handleInvoiceClick}
          />
          <ActionTile
            icon={<OrderDetailsIcon name="return-replace" size={28} className="h-7 w-7" />}
            label="Return / Replace"
            subtext={
              cardActions?.showReturn
                ? undefined
                : existingReturn
                  ? `${existingReturn.type} request: ${existingReturn.status}`
                  : "Available after delivery"
            }
            tone="orange"
            disabled={!cardActions?.showReturn}
            onClick={() => setReturnFormOpen(true)}
          />
          <ActionTile
            icon={<OrderDetailsIcon name="buy-again" size={28} className="h-7 w-7" />}
            label="Buy Again"
            tone="blue"
            disabled={!buyAgainItems.length || buyAgainPending || addToCart.isPending}
            onClick={() => void handleBuyAgain()}
          />
        </div>

        {returnSuccess ? (
          <p className="mt-4 text-sm font-semibold text-[#66C940]">{returnSuccess}</p>
        ) : null}
        {returnError ? (
          <p className="mt-4 text-sm font-semibold text-[#D92D20]">{returnError}</p>
        ) : null}
      </div>

      <Link
        href="/account/orders"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#66C940] hover:underline"
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
          onNotesChange={(value) => setReturnNotes(sanitizeTextInput(value, 1000))}
          isCod={isCod}
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

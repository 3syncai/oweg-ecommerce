"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import OrderBreadcrumbs from "@/components/orders/OrderBreadcrumbs";
import OrderCopyButton from "@/components/orders/OrderCopyButton";
import OrderVerticalTimeline from "@/components/orders/OrderVerticalTimeline";
import OrdersUiIcon from "@/components/ui/icons/orders-ui/OrdersUiIcon";
import { useOrderDetail } from "@/hooks/useOrderDetail";
import { isCancelledStatusImage, resolveOrderStatusImage } from "@/lib/order-status-assets";
import { getTrackHeroContent, getVerticalTrackingSteps } from "@/lib/order-tracker";
import {
  buildOrderHref,
  formatShippingAddress,
  getGoogleMapsUrl,
  getOrderDisplayLabel,
  getEasyShipPartnerLabel,
  getShiprocketAwb,
} from "@/lib/order-utils";

type TrackOrderContentProps = {
  orderId: string;
  orderNumber?: number | null;
};

export default function TrackOrderContent({ orderId, orderNumber }: TrackOrderContentProps) {
  const { order, loading, error, existingReturn } = useOrderDetail(orderId);

  const displayLabel = getOrderDisplayLabel(order, orderNumber);
  const awb = getShiprocketAwb(order);
  const partnerLabel = getEasyShipPartnerLabel(order);
  const hero = getTrackHeroContent(order, existingReturn);
  const statusImageSrc = resolveOrderStatusImage(order, existingReturn);
  const isCancelledHero = isCancelledStatusImage(statusImageSrc);
  const steps = getVerticalTrackingSteps(order, existingReturn);
  const address = order?.shipping_address;
  const detailHref = buildOrderHref(orderId, order?.display_id ?? orderNumber);
  const mapsUrl = getGoogleMapsUrl(address);

  if (loading && !order) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#326b29]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OrderBreadcrumbs
        items={[
          { label: "Orders", href: "/account/orders" },
          { label: "Track Order" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#326b29]">Delivery updates</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Track Order</h1>
          <p className="mt-2 text-sm text-slate-500">Order {displayLabel}</p>
        </div>
        {order?.id ? (
          <OrderCopyButton value={String(order.display_id ?? order.id)} label="Copy ID" />
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div
        className={`overflow-hidden rounded-2xl border border-l-4 p-5 sm:p-6 ${
          isCancelledHero
            ? "border-rose-200 border-l-rose-600 bg-rose-50/30"
            : "border-slate-200 border-l-[#326b29] bg-white"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                isCancelledHero ? "text-red-600" : "text-[#326b29]"
              }`}
            >
              {isCancelledHero ? "Cancelled" : "Live Status"}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{hero.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{hero.subtitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{hero.description}</p>
          </div>
          <img
            src={statusImageSrc}
            alt=""
            aria-hidden
            className="hidden h-24 w-24 shrink-0 object-contain sm:block"
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="mb-5 flex items-center gap-2">
            <OrdersUiIcon name="live-tracking" size={20} className="h-5 w-5" />
            <p className="text-sm font-semibold text-slate-900">Live Tracking</p>
          </div>
          <OrderVerticalTimeline steps={steps} />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <p className="mb-4 text-sm font-semibold text-slate-900">Delivery Details</p>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF8E7]">
                  <OrdersUiIcon name="delivery-partner" size={22} className="h-[22px] w-[22px]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{partnerLabel}</p>
                  <p className="text-xs text-slate-500">Delivery partner</p>
                </div>
              </div>

              {awb ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <p className="text-xs text-slate-500">Tracking ID</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="min-w-0 break-all text-sm font-semibold text-slate-900">{awb}</p>
                    <OrderCopyButton value={awb} label="Copy" />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Tracking ID will appear once your order ships.</p>
              )}

              <p className="text-xs text-slate-500">
                Need help? Call +91 8797787877 or email owegonline@oweg.in
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Delivery Address</p>
              <Link
                href="/account/addresses"
                className="text-xs font-semibold text-[#326b29] hover:underline"
              >
                Change
              </Link>
            </div>
            <div className="flex items-start gap-3">
              <OrdersUiIcon name="map-pin" size={20} className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {address?.first_name} {address?.last_name}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  {formatShippingAddress(address)}
                </p>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#326b29] hover:underline"
                >
                  Open in Maps
                  <OrdersUiIcon name="arrow-right" size={14} className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-900 sm:flex sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <OrdersUiIcon name="contact-support" size={22} className="h-[22px] w-[22px]" />
          <p className="text-sm font-semibold">Need help with your order?</p>
        </div>
        <Link
          href="/account/help"
          className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#326b29] transition hover:border-green-200 hover:bg-green-50 sm:mt-0"
        >
          Contact Support
        </Link>
      </div>

      <Link
        href={detailHref}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#326b29] hover:underline"
      >
        <OrdersUiIcon name="view-details" size={16} className="h-4 w-4" />
        Back to Order Details
      </Link>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const CANCELLATION_REASONS = [
  "My reasons are not listed here",
  "I want to change the delivery address",
  "I want to change the size/color/type",
  "I want to change the payment option",
  "I was hoping for a shorter delivery time",
  "Price of the product has now decreased",
  "I'm worried about the ratings/reviews",
  "I want to change the contact details",
] as const;

type OrderItem = {
  id: string;
  title?: string;
  quantity?: number;
  thumbnail?: string;
  unit_price?: number;
};

type CancelOrderPanelProps = {
  open: boolean;
  items: OrderItem[];
  currencyCode?: string;
  selectedReason: string;
  customReason: string;
  submitting: boolean;
  error: string | null;
  onReasonChange: (reason: string) => void;
  onCustomReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

const formatCurrency = (value?: number, currency?: string) => {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: (currency || "INR").toUpperCase(),
    maximumFractionDigits: 0,
  }).format(value);
};

export function CancelOrderPanel({
  open,
  items,
  currencyCode,
  selectedReason,
  customReason,
  submitting,
  error,
  onReasonChange,
  onCustomReasonChange,
  onClose,
  onSubmit,
}: CancelOrderPanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, submitting]);

  if (!open || !mounted) return null;

  const needsCustomReason = selectedReason === CANCELLATION_REASONS[0];
  const canSubmit =
    Boolean(selectedReason) &&
    (!needsCustomReason || customReason.trim().length >= 3) &&
    !submitting;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/55 px-0 backdrop-blur-[2px] sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-order-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default"
        aria-label="Close cancellation dialog"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />

      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-gray-100 bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-gray-200 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h2 id="cancel-order-title" className="truncate text-base font-semibold text-gray-900 sm:text-lg">
                Request Cancellation
              </h2>
              <p className="text-xs text-gray-500">Select a reason to continue</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-3 border-b border-gray-100 bg-gray-50/80 px-4 py-4 sm:px-6">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  {item.thumbnail ? (
                    <Image
                      src={item.thumbnail}
                      alt={item.title || "Item"}
                      fill
                      className="object-contain p-1"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{item.title || "Item"}</p>
                  <p className="mt-0.5 text-xs text-gray-500">Qty: {item.quantity || 1}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-gray-900">
                  {formatCurrency((item.unit_price || 0) * (item.quantity || 1), currencyCode)}
                </p>
              </div>
            ))}
          </div>

          <div className="px-4 py-5 sm:px-6">
            <p className="text-sm font-semibold text-gray-900">Reason for cancellation</p>
            <p className="mt-1 text-xs text-gray-500">Choose the option that best describes why you want to cancel.</p>

            <div className="mt-4 space-y-2">
              {CANCELLATION_REASONS.map((reason) => {
                const selected = selectedReason === reason;
                return (
                  <label
                    key={reason}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition",
                      selected
                        ? "border-emerald-200 bg-emerald-50/70 ring-1 ring-emerald-100"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition",
                        selected ? "border-emerald-600" : "border-gray-300"
                      )}
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full transition",
                          selected ? "bg-emerald-600" : "bg-transparent"
                        )}
                      />
                    </span>
                    <input
                      type="radio"
                      name="cancellation-reason"
                      value={reason}
                      checked={selected}
                      onChange={() => onReasonChange(reason)}
                      className="sr-only"
                    />
                    <span className={cn("text-sm leading-5", selected ? "font-medium text-gray-900" : "text-gray-700")}>
                      {reason}
                    </span>
                  </label>
                );
              })}
            </div>

            {needsCustomReason && (
              <div className="mt-4 space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <Label htmlFor="custom-cancel-reason" className="text-xs font-semibold text-gray-700">
                  Tell us your reason
                </Label>
                <textarea
                  id="custom-cancel-reason"
                  value={customReason}
                  onChange={(event) => onCustomReasonChange(event.target.value)}
                  rows={3}
                  maxLength={180}
                  placeholder="Please share your reason (minimum 3 characters)"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/20 focus:border-emerald-400 focus:ring-2"
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 bg-white px-4 py-4 sm:px-6">
          {error && (
            <p className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className={cn(
              "h-11 w-full rounded-xl text-sm font-semibold transition disabled:pointer-events-auto",
              canSubmit
                ? "cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700"
                : "cursor-not-allowed bg-gray-200 text-gray-500 hover:bg-gray-200"
            )}
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="mt-3 w-full cursor-pointer text-center text-sm font-medium text-gray-500 transition hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Keep my order
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

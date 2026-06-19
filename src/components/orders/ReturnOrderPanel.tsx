"use client";

import { useEffect, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  ArrowLeft,
  PackageMinus,
  PackageX,
  RefreshCw,
  Ruler,
  ShieldAlert,
  ShoppingBag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const RETURN_REASONS = [
  {
    id: "not_needed",
    title: "Product not needed anymore",
    description: "Didn't like the product or ordered by mistake",
    icon: ShoppingBag,
  },
  {
    id: "quality",
    title: "Quality issue",
    description: "Poor fabric/material, finishing or performance",
    icon: ShieldAlert,
  },
  {
    id: "size_fit",
    title: "Size/Fit issue",
    description: "Tight or loose fitting",
    icon: Ruler,
  },
  {
    id: "damaged",
    title: "Damaged/Used product",
    description: "Dirty, old, torn, or broken products",
    icon: PackageX,
  },
  {
    id: "missing",
    title: "Item Missing in the package",
    description: "Part missing in product or got less quantity",
    icon: PackageMinus,
  },
  {
    id: "wrong_item",
    title: "Different product delivered",
    description: "Received different size/colour/product than ordered",
    icon: RefreshCw,
  },
] as const;

export type ReturnItemForm = {
  order_item_id: string;
  title?: string;
  thumbnail?: string;
  max: number;
  quantity: number;
  selected: boolean;
};

type OrderItem = {
  id: string;
  title?: string;
  quantity?: number;
  thumbnail?: string;
  unit_price?: number;
};

type BankDetails = {
  account_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
};

type ReturnOrderPanelProps = {
  open: boolean;
  orderNumber?: number | null;
  returnType: "return" | "replacement";
  onReturnTypeChange: (type: "return" | "replacement") => void;
  orderItems: OrderItem[];
  returnItems: ReturnItemForm[];
  onReturnItemsChange: (items: ReturnItemForm[]) => void;
  currencyCode?: string;
  selectedReason: string;
  onReasonChange: (reason: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  isCod: boolean;
  bankDetails: BankDetails;
  onBankDetailsChange: (details: BankDetails) => void;
  submitting: boolean;
  error: string | null;
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

function ReasonOption({
  title,
  description,
  icon: Icon,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition",
        selected
          ? "border-emerald-200 bg-emerald-50/70 ring-1 ring-emerald-100"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      )}
    >
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-5", selected ? "font-semibold text-gray-900" : "font-medium text-gray-800")}>
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-gray-500">{description}</span>
      </span>
      <span
        className={cn(
          "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition",
          selected ? "border-emerald-600" : "border-gray-300"
        )}
      >
        <span className={cn("h-2.5 w-2.5 rounded-full transition", selected ? "bg-emerald-600" : "bg-transparent")} />
      </span>
      <input type="radio" checked={selected} onChange={onSelect} className="sr-only" />
    </label>
  );
}

export function ReturnOrderPanel({
  open,
  orderNumber,
  returnType,
  onReturnTypeChange,
  orderItems,
  returnItems,
  onReturnItemsChange,
  currencyCode,
  selectedReason,
  onReasonChange,
  notes,
  onNotesChange,
  isCod,
  bankDetails,
  onBankDetailsChange,
  submitting,
  error,
  onClose,
  onSubmit,
}: ReturnOrderPanelProps) {
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

  const selectedCount = returnItems.filter((item) => item.selected && item.quantity > 0).length;
  const bankReady =
    !isCod ||
    (bankDetails.account_name.trim() &&
      bankDetails.account_number.trim() &&
      bankDetails.ifsc_code.trim());
  const canSubmit = Boolean(selectedReason) && selectedCount > 0 && bankReady && !submitting;

  const panelTitle =
    returnType === "replacement"
      ? `Replacement for${orderNumber ? ` #${orderNumber}` : ""}`
      : `Return/Exchange${orderNumber ? ` for #${orderNumber}` : ""}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/55 px-0 backdrop-blur-[2px] sm:items-center sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-order-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default"
        aria-label="Close return dialog"
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
              <h2 id="return-order-title" className="truncate text-sm font-semibold uppercase tracking-wide text-gray-900 sm:text-base">
                {panelTitle}
              </h2>
              <p className="text-xs text-gray-500">7 days easy return & replacement on defects</p>
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
          <div className="border-b border-gray-100 px-4 py-4 sm:px-6">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1">
              {(["return", "replacement"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onReturnTypeChange(type)}
                  className={cn(
                    "cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold capitalize transition",
                    returnType === type ? "bg-white text-emerald-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-b border-gray-100 bg-gray-50/80 px-4 py-4 sm:px-6">
            {orderItems.map((item) => {
              const formItem = returnItems.find((entry) => entry.order_item_id === item.id);
              const qty = formItem?.quantity || item.quantity || 1;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                    {item.thumbnail ? (
                      <Image src={item.thumbnail} alt={item.title || "Item"} fill className="object-contain p-1" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{item.title || "Item"}</p>
                    <p className="mt-0.5 text-xs text-gray-500">Qty: {item.quantity || 1}</p>
                    <p className="mt-1 text-[11px] font-medium text-emerald-700">All issue easy returns</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-gray-900">
                    {formatCurrency((item.unit_price || 0) * qty, currencyCode)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="px-4 py-5 sm:px-6">
            <p className="text-sm font-semibold text-gray-900">Please select reason for return/exchange</p>

            <div className="mt-4 space-y-2">
              {RETURN_REASONS.map((reason) => (
                <ReasonOption
                  key={reason.id}
                  title={reason.title}
                  description={reason.description}
                  icon={reason.icon}
                  selected={selectedReason === reason.title}
                  onSelect={() => onReasonChange(reason.title)}
                />
              ))}
            </div>

            <div className="mt-5 space-y-2">
              <Label htmlFor="return-items" className="text-xs font-semibold text-gray-700">
                Items to {returnType}
              </Label>
              <div id="return-items" className="divide-y overflow-hidden rounded-2xl border border-gray-200">
                {returnItems.map((item) => (
                  <div key={item.order_item_id} className="flex flex-wrap items-center gap-3 bg-white p-3">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => {
                          const selected = event.target.checked;
                          onReturnItemsChange(
                            returnItems.map((entry) =>
                              entry.order_item_id === item.order_item_id ? { ...entry, selected } : entry
                            )
                          );
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                      />
                      <span className="truncate">{item.title || "Item"}</span>
                    </label>
                    <div className="ml-auto flex items-center gap-2 text-sm">
                      <span className="text-xs text-gray-500">Qty</span>
                      <input
                        type="number"
                        min={1}
                        max={item.max}
                        value={item.quantity}
                        disabled={!item.selected}
                        onChange={(event) => {
                          const value = Math.min(item.max, Math.max(1, Number(event.target.value) || 1));
                          onReturnItemsChange(
                            returnItems.map((entry) =>
                              entry.order_item_id === item.order_item_id ? { ...entry, quantity: value } : entry
                            )
                          );
                        }}
                        className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm disabled:bg-gray-50"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {isCod && (
              <div className="mt-5 space-y-2">
                <Label className="text-xs font-semibold text-gray-700">Bank details for refund</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={bankDetails.account_name}
                    onChange={(event) =>
                      onBankDetailsChange({ ...bankDetails, account_name: event.target.value })
                    }
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    placeholder="Account holder name"
                  />
                  <input
                    value={bankDetails.account_number}
                    onChange={(event) =>
                      onBankDetailsChange({ ...bankDetails, account_number: event.target.value })
                    }
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    placeholder="Account number"
                  />
                  <input
                    value={bankDetails.ifsc_code}
                    onChange={(event) => onBankDetailsChange({ ...bankDetails, ifsc_code: event.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    placeholder="IFSC code"
                  />
                  <input
                    value={bankDetails.bank_name}
                    onChange={(event) => onBankDetailsChange({ ...bankDetails, bank_name: event.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    placeholder="Bank name (optional)"
                  />
                </div>
              </div>
            )}

            <div className="mt-5 space-y-2">
              <Label htmlFor="return-notes" className="text-xs font-semibold text-gray-700">
                Notes (optional)
              </Label>
              <textarea
                id="return-notes"
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Add extra context"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none ring-emerald-500/20 focus:border-emerald-400 focus:ring-2"
              />
            </div>
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
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

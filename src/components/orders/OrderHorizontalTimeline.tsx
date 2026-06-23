"use client";

import OrdersUiIcon from "@/components/ui/icons/orders-ui/OrdersUiIcon";
import type { OrdersUiIconName } from "@/components/ui/icons/orders-ui/OrdersUiIcon";
import type { TrackerStep, TrackerStepKey } from "@/lib/order-types";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<TrackerStepKey, OrdersUiIconName> = {
  placed: "order-placed",
  paid: "payment-confirmed",
  processing: "package-processing",
  shipped: "shipped-truck",
  delivered: "delivered-check",
  cancelled: "cancelled-status",
  return: "return-replace",
};

type OrderHorizontalTimelineProps = {
  steps: TrackerStep[];
};

export default function OrderHorizontalTimeline({ steps }: OrderHorizontalTimelineProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-[#1F2A33]">Order Status</p>
      <div
        className={cn(
          "grid gap-4",
          steps.length <= 2 ? "grid-cols-2" : steps.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-5"
        )}
      >
        {steps.map((step) => (
          <div key={step.key} className="min-w-0 space-y-2">
            <div
              className={cn(
                "flex items-center gap-2 text-xs font-semibold sm:text-sm",
                step.tone === "cancelled"
                  ? "text-[#D92D20]"
                  : step.active
                    ? "text-[#66C940]"
                    : "text-gray-400"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  step.tone === "cancelled"
                    ? "bg-red-50"
                    : step.active
                      ? "bg-[#EAF8E7]"
                      : "bg-gray-100"
                )}
              >
                <OrdersUiIcon name={STEP_ICONS[step.key]} size={18} className="h-[18px] w-[18px]" />
              </span>
              <span className="truncate">{step.label}</span>
            </div>
            <div
              className={cn(
                "h-1 rounded-full",
                step.tone === "cancelled"
                  ? "bg-[#D92D20]"
                  : step.active
                    ? "bg-[#66C940]"
                    : "bg-gray-200"
              )}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">Status updates refresh as soon as your order progresses.</p>
    </div>
  );
}

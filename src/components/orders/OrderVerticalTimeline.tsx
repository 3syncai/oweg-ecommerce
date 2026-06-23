"use client";

import OrdersUiIcon from "@/components/ui/icons/orders-ui/OrdersUiIcon";
import type { OrdersUiIconName } from "@/components/ui/icons/orders-ui/OrdersUiIcon";
import type { TrackerStep, TrackerStepKey } from "@/lib/order-types";
import { formatOrderDateTime } from "@/lib/order-utils";
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

type OrderVerticalTimelineProps = {
  steps: TrackerStep[];
};

export default function OrderVerticalTimeline({ steps }: OrderVerticalTimelineProps) {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isCurrent = step.current;
        const isComplete = step.active && !isCurrent;

        return (
          <div key={`${step.key}-${index}`} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2",
                  step.tone === "cancelled"
                    ? "border-[#D92D20] bg-red-50"
                    : isCurrent
                      ? "border-[#66C940] bg-[#EAF8E7]"
                      : isComplete
                        ? "border-[#66C940] bg-[#66C940]"
                        : "border-gray-200 bg-gray-50"
                )}
              >
                <OrdersUiIcon
                  name={STEP_ICONS[step.key]}
                  size={20}
                  className={cn(
                    "h-5 w-5",
                    isComplete && step.tone !== "cancelled" && "brightness-0 invert"
                  )}
                />
              </span>
              {!isLast ? (
                <div
                  className={cn(
                    "my-1 w-0.5 flex-1 min-h-[32px]",
                    isComplete || isCurrent ? "bg-[#66C940]" : "bg-gray-200"
                  )}
                />
              ) : null}
            </div>

            <div className={cn("min-w-0 pb-6", isLast && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-semibold",
                  step.tone === "cancelled"
                    ? "text-[#D92D20]"
                    : isCurrent
                      ? "text-[#66C940]"
                      : step.active
                        ? "text-[#1F2A33]"
                        : "text-gray-400"
                )}
              >
                {step.label}
              </p>
              {step.timestamp ? (
                <p className="mt-0.5 text-xs text-gray-500">{formatOrderDateTime(step.timestamp)}</p>
              ) : null}
              {step.description ? (
                <p className="mt-1 text-xs text-gray-600">{step.description}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

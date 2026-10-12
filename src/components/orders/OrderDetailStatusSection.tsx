"use client";

import { Check } from "lucide-react";
import OrderDetailsIcon from "@/components/ui/icons/order-details/OrderDetailsIcon";
import type { OrderDetail, ReturnRequest, TrackerStep } from "@/lib/order-types";
import {
  getOrderDetailStatusMessage,
  getTrackerStepDetailIcon,
} from "@/lib/order-tracker";
import { formatOrderDateTime } from "@/lib/order-utils";
import { cn } from "@/lib/utils";

type OrderDetailStatusSectionProps = {
  id?: string;
  order?: OrderDetail | null;
  steps: TrackerStep[];
  existingReturn?: ReturnRequest | null;
};

export default function OrderDetailStatusSection({
  id,
  order,
  steps,
  existingReturn = null,
}: OrderDetailStatusSectionProps) {
  const timelineSteps = steps;
  const currentIndex = timelineSteps.findIndex((step) => step.current);
  const statusMessage = getOrderDetailStatusMessage(order, timelineSteps, existingReturn);
  const hasActiveReturn = timelineSteps.some(
    (step) => step.key === "return" && (step.current || step.active)
  );

  return (
    <section
      id={id}
      className="scroll-mt-28 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
    >
      <div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Order Status</p>

          <div className="mt-6">
            <div className="flex flex-col md:flex-row md:items-start">
              {timelineSteps.map((step, index) => {
                const isReturnStep = step.key === "return";
                const isCurrent = step.current;
                const isComplete = step.active && !isCurrent;
                const isFuture = !step.active;
                const showConnector = index < timelineSteps.length - 1;
                const connectorActive =
                  currentIndex >= 0 ? index < currentIndex : step.active && !isCurrent;
                const returnTone = isReturnStep && (isCurrent || (hasActiveReturn && isComplete));

                return (
                  <div key={`${step.key}-${index}`} className="relative min-w-0 flex-1">
                    <div className="relative z-10 flex items-start gap-3 md:flex-col md:items-center md:gap-0 md:px-1">
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2",
                          step.tone === "cancelled"
                            ? "border-[#D92D20] bg-red-50"
                            : returnTone && isCurrent
                              ? "border-[#F79009] bg-[#FFF4E5]"
                              : returnTone && isComplete
                                ? "border-[#F79009] bg-[#F79009]"
                                : isComplete
                                  ? "border-[#326b29] bg-[#326b29]"
                                  : isCurrent
                                    ? "border-[#326b29] bg-green-50 ring-4 ring-green-50"
                                    : "border-slate-200 bg-slate-50"
                        )}
                      >
                        {isComplete && step.tone !== "cancelled" && !isReturnStep ? (
                          <Check className="h-5 w-5 text-white" strokeWidth={3} />
                        ) : isComplete && isReturnStep ? (
                          <OrderDetailsIcon
                            name="return-replace"
                            size={20}
                            className="h-5 w-5 brightness-0 invert"
                          />
                        ) : (
                          <OrderDetailsIcon
                            name={getTrackerStepDetailIcon(step.key)}
                            size={20}
                            className={cn("h-5 w-5", isFuture && "opacity-40")}
                          />
                        )}
                      </span>

                      <div className={cn("min-w-0 pb-6 pt-1 md:pb-0 md:pt-0", !showConnector && "pb-0")}>
                        <p
                          className={cn(
                            "text-xs font-semibold leading-relaxed md:mt-3 md:text-center",
                            step.tone === "cancelled"
                              ? "text-[#D92D20]"
                              : isReturnStep && isCurrent
                                ? "text-[#B54708]"
                                : isCurrent
                                  ? "text-[#326b29]"
                                  : step.active
                                    ? "text-slate-900"
                                    : "text-slate-400"
                          )}
                        >
                          {step.label}
                        </p>

                        {step.timestamp ? (
                          <p className="mt-1 text-[10px] leading-relaxed text-slate-500 md:text-center">
                            {formatOrderDateTime(step.timestamp)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {showConnector ? (
                      <div
                        className={cn(
                          "absolute left-[19px] top-10 h-[calc(100%-40px)] w-0.5 rounded-full md:left-[calc(50%+20px)] md:top-[19px] md:h-0.5 md:w-[calc(100%-40px)]",
                          connectorActive || (isComplete && index < currentIndex)
                            ? returnTone ||
                              timelineSteps[index + 1]?.key === "return"
                              ? "bg-[#F79009]"
                              : "bg-[#326b29]"
                            : "bg-slate-200"
                        )}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">{statusMessage}</p>
        </div>
      </div>
    </section>
  );
}

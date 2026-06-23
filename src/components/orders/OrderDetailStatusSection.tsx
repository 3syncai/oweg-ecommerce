"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import OrderDetailsIcon from "@/components/ui/icons/order-details/OrderDetailsIcon";
import type { OrderDetail } from "@/lib/order-types";
import {
  getOrderDetailStatusMessage,
  getTrackerStepDetailIcon,
} from "@/lib/order-tracker";
import type { TrackerStep } from "@/lib/order-types";
import { formatOrderDateTime } from "@/lib/order-utils";
import { cn } from "@/lib/utils";

type OrderDetailStatusSectionProps = {
  id?: string;
  order?: OrderDetail | null;
  steps: TrackerStep[];
};

export default function OrderDetailStatusSection({
  id,
  order,
  steps,
}: OrderDetailStatusSectionProps) {
  const timelineSteps = steps.filter((step) => step.key !== "return");
  const currentIndex = timelineSteps.findIndex((step) => step.current);
  const statusMessage = getOrderDetailStatusMessage(order, timelineSteps);

  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#1F2A33]">Order Status</p>

          <div className="mt-5 overflow-x-auto pb-2">
            <div className="flex min-w-[520px] items-start">
              {timelineSteps.map((step, index) => {
                const isCurrent = step.current;
                const isComplete = step.active && !isCurrent;
                const isFuture = !step.active;
                const showConnector = index < timelineSteps.length - 1;
                const connectorActive =
                  currentIndex >= 0 ? index < currentIndex : step.active && !isCurrent;

                return (
                  <div key={`${step.key}-${index}`} className="flex min-w-0 flex-1 items-start">
                    <div className="flex min-w-0 flex-1 flex-col items-center px-1">
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2",
                          step.tone === "cancelled"
                            ? "border-[#D92D20] bg-red-50"
                            : isComplete
                              ? "border-[#66C940] bg-[#66C940]"
                              : isCurrent
                                ? "border-[#66C940] bg-[#EAF8E7]"
                                : "border-gray-200 bg-gray-50"
                        )}
                      >
                        {isComplete && step.tone !== "cancelled" ? (
                          <Check className="h-5 w-5 text-white" strokeWidth={3} />
                        ) : (
                          <OrderDetailsIcon
                            name={getTrackerStepDetailIcon(step.key)}
                            size={20}
                            className={cn(
                              "h-5 w-5",
                              isFuture && "opacity-40"
                            )}
                          />
                        )}
                      </span>

                      <p
                        className={cn(
                          "mt-3 text-center text-xs font-semibold sm:text-sm",
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
                        <p className="mt-1 text-center text-[11px] text-gray-500">
                          {formatOrderDateTime(step.timestamp)}
                        </p>
                      ) : null}
                    </div>

                    {showConnector ? (
                      <div
                        className={cn(
                          "mt-5 h-0.5 w-full min-w-[24px] flex-1 rounded-full",
                          connectorActive || (isComplete && index < currentIndex)
                            ? "bg-[#66C940]"
                            : "bg-gray-200"
                        )}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-gray-600">{statusMessage}</p>
        </div>

        <div className="mx-auto shrink-0 lg:mx-0">
          <Image
            src="/images/order-details/order-status-illustration.png"
            alt=""
            width={180}
            height={180}
            className="h-36 w-36 object-contain sm:h-44 sm:w-44"
            aria-hidden
          />
        </div>
      </div>
    </section>
  );
}

import type { AccountOrder } from "@/hooks/useAccountOrdersSummary";
import type { OrderDetail, ReturnRequest } from "@/lib/order-types";
import { resolveOrderBucket } from "@/hooks/useAccountOrdersSummary";
import { canCancelOrder, isWithinReturnWindow } from "@/lib/order-tracker";

export type OrderCardActions = {
  showTrack: boolean;
  showViewDetails: boolean;
  showBuyAgain: boolean;
  showCancel: boolean;
  showReturn: boolean;
};

export function getOrderCardActions(
  order: AccountOrder | OrderDetail,
  existingReturn?: ReturnRequest | null
): OrderCardActions {
  const bucket = resolveOrderBucket(order);
  const cancelled = bucket === "canceled";

  return {
    showTrack: !cancelled,
    showViewDetails: true,
    showBuyAgain: true,
    showCancel: canCancelOrder(order, existingReturn ?? null),
    showReturn:
      bucket === "delivered" && isWithinReturnWindow(order) && !existingReturn,
  };
}

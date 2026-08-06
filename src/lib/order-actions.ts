import type { AccountOrder } from "@/hooks/useAccountOrdersSummary";
import {
  hasActiveOrderReturn,
  resolveOrderBucket,
} from "@/hooks/useAccountOrdersSummary";
import type { OrderDetail, ReturnRequest } from "@/lib/order-types";
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
  const bucket = resolveOrderBucket(order as AccountOrder);
  const cancelled = bucket === "canceled";
  const activeReturn = Boolean(existingReturn) || hasActiveOrderReturn(order);

  return {
    showTrack: !cancelled,
    showViewDetails: true,
    showBuyAgain: true,
    showCancel: canCancelOrder(order as OrderDetail, existingReturn ?? null) && !activeReturn,
    showReturn:
      bucket === "delivered" &&
      isWithinReturnWindow(order as OrderDetail) &&
      !activeReturn,
  };
}

"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";

export type AccountOrder = {
  id: string;
  display_id?: number;
  created_at?: string;
  currency_code?: string;
  status?: string;
  total?: number;
  payment_status?: string;
  fulfillment_status?: string;
  metadata?: Record<string, unknown>;
  items?: Array<{
    id: string;
    title?: string;
    quantity?: number;
    thumbnail?: string;
    variant_id?: string;
  }>;
};

export type AccountOrderCounts = {
  all: number;
  processing: number;
  shipped: number;
  delivered: number;
  returns: number;
  canceled: number;
};

type OrdersResponse = {
  orders?: AccountOrder[];
  count?: number;
};

export type AccountOrderBucket = keyof Omit<AccountOrderCounts, "all">;

const ACTIVE_RETURN_STATUSES = new Set([
  "pending_approval",
  "approved",
  "pickup_initiated",
  "picked_up",
  "received",
]);

const RETURN_STATUS_LABELS: Record<string, string> = {
  pending_approval: "Return requested",
  approved: "Return approved",
  pickup_initiated: "Pickup scheduled",
  picked_up: "Return picked up",
  received: "Return received",
  refunded: "Refund completed",
  replaced: "Replacement shipped",
  rejected: "Return rejected",
  closed: "Return closed",
};

export function getOrderReturnRequestStatus(
  order: AccountOrder | { metadata?: Record<string, unknown> | null }
): string {
  const metadata = order.metadata || {};
  return typeof metadata.return_request_status === "string"
    ? metadata.return_request_status.toLowerCase()
    : "";
}

export function hasActiveOrderReturn(
  order: AccountOrder | { metadata?: Record<string, unknown> | null }
): boolean {
  return ACTIVE_RETURN_STATUSES.has(getOrderReturnRequestStatus(order));
}

export function resolveOrderBucket(order: AccountOrder): AccountOrderBucket {
  const status = (order.status || "").toLowerCase();
  const fulfillment = (order.fulfillment_status || "").toLowerCase();
  const metadata = order.metadata || {};
  const shiprocketStatus =
    typeof metadata.shiprocket_status === "string"
      ? metadata.shiprocket_status.toLowerCase()
      : "";
  const returnStatus = getOrderReturnRequestStatus(order);

  if (status === "canceled" || status === "cancelled") {
    return "canceled";
  }
  if (ACTIVE_RETURN_STATUSES.has(returnStatus)) {
    return "returns";
  }
  if (fulfillment === "delivered" || shiprocketStatus === "delivered") {
    return "delivered";
  }
  if (
    ["shipped", "partially_shipped"].includes(fulfillment) ||
    ["picked_up", "pickup_scheduled", "pickup_initiated", "in_transit", "out_for_delivery", "shipped"].includes(
      shiprocketStatus
    )
  ) {
    return "shipped";
  }
  return "processing";
}

/** Human-readable list/detail-aligned status for an order card. */
export function resolveOrderStatusLabel(order: AccountOrder): string {
  const status = (order.status || "").toLowerCase();
  if (status === "canceled" || status === "cancelled") {
    return "Canceled";
  }

  const returnStatus = getOrderReturnRequestStatus(order);
  if (returnStatus && RETURN_STATUS_LABELS[returnStatus]) {
    return RETURN_STATUS_LABELS[returnStatus];
  }

  const bucket = resolveOrderBucket(order);
  const bucketLabels: Record<AccountOrderBucket, string> = {
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    returns: "Return in progress",
    canceled: "Canceled",
  };
  return bucketLabels[bucket];
}

function buildOrderCounts(orders: AccountOrder[], totalCount: number): AccountOrderCounts {
  const counts: AccountOrderCounts = {
    all: totalCount,
    processing: 0,
    shipped: 0,
    delivered: 0,
    returns: 0,
    canceled: 0,
  };

  for (const order of orders) {
    const bucket = resolveOrderBucket(order);
    counts[bucket] += 1;
  }

  return counts;
}

function computeTotalSpent(orders: AccountOrder[]): number {
  return orders.reduce((sum, order) => {
    const status = (order.status || "").toLowerCase();
    if (status === "canceled" || status === "cancelled") {
      return sum;
    }
    return sum + (typeof order.total === "number" ? order.total : 0);
  }, 0);
}

export function useAccountOrdersSummary(options?: {
  page?: number;
  pageSize?: number;
}) {
  const { customer } = useAuth();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? 15, 50));
  const offset = (page - 1) * pageSize;

  const ordersQuery = useQuery<{ orders: AccountOrder[]; count: number }>({
    queryKey: ["account-orders-summary", customer?.id, page, pageSize],
    enabled: Boolean(customer?.id),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        `/api/medusa/orders?limit=${pageSize}&offset=${offset}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );
      if (res.status === 401) return { orders: [], count: 0 };
      if (!res.ok) throw new Error("Unable to load orders");
      const data = (await res.json()) as OrdersResponse;
      const orders = Array.isArray(data.orders) ? data.orders : [];
      const count =
        typeof data.count === "number" ? data.count : orders.length + offset;
      return { orders, count };
    },
  });

  const orders = ordersQuery.data?.orders ?? [];
  const count = ordersQuery.data?.count ?? 0;

  const counts = useMemo(() => buildOrderCounts(orders, count), [orders, count]);
  const totalSpent = useMemo(() => computeTotalSpent(orders), [orders]);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const hasMore = page < totalPages;

  return {
    orders,
    count,
    page,
    pageSize,
    totalPages,
    hasMore,
    counts,
    totalSpent,
    loading: ordersQuery.isLoading,
    error: ordersQuery.error instanceof Error ? ordersQuery.error.message : null,
    refresh: ordersQuery.refetch,
  };
}

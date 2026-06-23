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
  canceled: number;
};

type OrdersResponse = {
  orders?: AccountOrder[];
  count?: number;
};

const ENDPOINT = "/api/medusa/orders?limit=100&offset=0";

export type AccountOrderBucket = keyof Omit<AccountOrderCounts, "all">;

export function resolveOrderBucket(order: AccountOrder): AccountOrderBucket {
  const status = (order.status || "").toLowerCase();
  const fulfillment = (order.fulfillment_status || "").toLowerCase();
  const metadata = order.metadata || {};
  const shiprocketStatus =
    typeof metadata.shiprocket_status === "string"
      ? metadata.shiprocket_status.toLowerCase()
      : "";

  if (status === "canceled" || status === "cancelled") {
    return "canceled";
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

function buildOrderCounts(orders: AccountOrder[]): AccountOrderCounts {
  const counts: AccountOrderCounts = {
    all: orders.length,
    processing: 0,
    shipped: 0,
    delivered: 0,
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

export function useAccountOrdersSummary() {
  const { customer } = useAuth();

  const ordersQuery = useQuery<AccountOrder[]>({
    queryKey: ["account-orders-summary", customer?.id],
    enabled: Boolean(customer?.id),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(ENDPOINT, {
        cache: "no-store",
        credentials: "include",
      });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Unable to load orders");
      const data = (await res.json()) as OrdersResponse;
      return Array.isArray(data.orders) ? data.orders : [];
    },
  });

  const orders = ordersQuery.data ?? [];

  const counts = useMemo(() => buildOrderCounts(orders), [orders]);
  const totalSpent = useMemo(() => computeTotalSpent(orders), [orders]);

  return {
    orders,
    counts,
    totalSpent,
    loading: ordersQuery.isLoading,
    error: ordersQuery.error instanceof Error ? ordersQuery.error.message : null,
    refresh: ordersQuery.refetch,
  };
}

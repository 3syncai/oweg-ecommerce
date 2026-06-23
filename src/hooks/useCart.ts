"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import {
  extractCartItems,
  type CartApiPayload,
} from "@/lib/cart-helpers";
import { getGuestCartId, setGuestCartId } from "@/lib/guest-cart";

export type CartLineInfo = {
  lineId: string;
  quantity: number;
  variantId: string;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function getVariantIdFromLine(item: CartApiPayload): string | null {
  const direct = item.variant_id;
  if (direct != null && String(direct).trim() !== "") {
    return String(direct);
  }
  const variant = item.variant;
  if (typeof variant === "object" && variant !== null && "id" in variant) {
    const nested = (variant as Record<string, unknown>).id;
    if (nested != null && String(nested).trim() !== "") {
      return String(nested);
    }
  }
  return null;
}

export function findCartLineByVariant(
  items: CartApiPayload[],
  variantId?: string | null
): CartLineInfo | null {
  if (!variantId) return null;
  const target = String(variantId);
  for (const item of items) {
    const itemVariantId = getVariantIdFromLine(item);
    if (!itemVariantId || itemVariantId !== target) continue;
    const lineId = item.id != null ? String(item.id) : null;
    if (!lineId) continue;
    return {
      lineId,
      quantity: Math.max(0, toNumber(item.quantity, 0)),
      variantId: itemVariantId,
    };
  }
  return null;
}

async function fetchCartPayload(): Promise<CartApiPayload> {
  const guestCartId = getGuestCartId();
  const res = await fetch("/api/medusa/cart", {
    cache: "no-store",
    credentials: "include",
    headers: {
      ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
    },
  });
  if (!res.ok) {
    throw new Error("Failed to load cart");
  }
  const data = (await res.json()) as CartApiPayload;
  if (data.guestCartId && typeof data.guestCartId === "string") {
    setGuestCartId(data.guestCartId);
  }
  return data;
}

export function useCart() {
  const { customer } = useAuth();
  return useQuery({
    queryKey: ["cart", customer?.id ?? "guest"],
    queryFn: fetchCartPayload,
    staleTime: 30_000,
  });
}

export function useCartLineByVariant(variantId?: string | null) {
  const { data, isLoading, isFetching } = useCart();
  const line = useMemo(() => {
    const items = extractCartItems(data);
    return findCartLineByVariant(items, variantId);
  }, [data, variantId]);

  return {
    line,
    isLoading: isLoading || isFetching,
  };
}

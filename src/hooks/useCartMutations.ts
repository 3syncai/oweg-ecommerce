// useCartMutations: React Query hooks for cart operations

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCartSummary } from "@/contexts/CartProvider";
import {
  notifyCartAddError,
  notifyCartAddSuccess,
  notifyCartUnavailable,
  notifyQuantityUpdated,
  notifyRemoveItem,
} from "@/lib/notifications";
import type { CartApiPayload } from "@/lib/cart-helpers";
import { useRouter } from "next/navigation";
import { getGuestCartId, setGuestCartId } from "@/lib/guest-cart";
import { clearStaleBuyNowSnapshot } from "@/lib/checkout-redirects";
import { useAuth } from "@/contexts/AuthProvider";

type AddToCartParams = {
  variant_id: string;
  quantity?: number;
};

type AddToCartResponse = {
  cart?: unknown;
  id?: string;
  guestCartId?: string;
  [key: string]: unknown;
};

type UpdateLineItemParams = {
  lineId: string;
  quantity: number;
  label?: string;
};

type RemoveLineItemParams = {
  lineId: string;
  label?: string;
};

function invalidateCartQuery(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["cart"] });
}

function buildCartHeaders(customer: unknown): Record<string, string> {
  const guestCartId = getGuestCartId();
  if (guestCartId && !customer) {
    return { "x-guest-cart-id": guestCartId };
  }
  return {};
}

/**
 * Hook for adding items to cart using React Query
 */
export function useAddToCart() {
  const queryClient = useQueryClient();
  const { count, syncFromCartPayload, bumpCount, restoreCount } = useCartSummary();
  const { customer } = useAuth();

  return useMutation({
    mutationFn: async ({ variant_id, quantity = 1 }: AddToCartParams) => {
      // Single request — line-items route ensures cart exists (no separate cart POST).
      const response = await fetch("/api/medusa/cart/line-items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...buildCartHeaders(customer),
        },
        body: JSON.stringify({ variant_id, quantity }),
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          (payload && (payload.error || payload.message)) ||
          "Could not add to cart";
        throw new Error(message);
      }

      const payload = (await response.json()) as AddToCartResponse;

      if (payload.guestCartId && !customer && typeof payload.guestCartId === "string") {
        setGuestCartId(payload.guestCartId);
      }

      return payload;
    },
    onMutate: async ({ quantity = 1 }) => {
      await queryClient.cancelQueries({ queryKey: ["cart"] });
      const previousCount = count;
      bumpCount(quantity);
      return { previousCount };
    },
    onSuccess: (data) => {
      if (data) {
        syncFromCartPayload(data as unknown as Parameters<typeof syncFromCartPayload>[0]);
      }
      invalidateCartQuery(queryClient);
    },
    onError: (_error, _variables, context) => {
      if (context && typeof context.previousCount === "number") {
        restoreCount(context.previousCount);
      }
    },
  });
}

/**
 * Hook for adding product to cart with notifications
 */
export function useAddToCartWithNotification(productName?: string) {
  const addToCart = useAddToCart();
  const router = useRouter();

  const addToCartWithNotification = async (variant_id: string) => {
    if (!variant_id) {
      notifyCartUnavailable();
      return;
    }

    const label = productName || "Product";
    notifyCartAddSuccess(label, 1, () => router.push("/cart"));

    try {
      clearStaleBuyNowSnapshot();
      return await addToCart.mutateAsync({ variant_id, quantity: 1 });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not add to cart";
      notifyCartAddError(message);
      throw err;
    }
  };

  return {
    addToCart: addToCartWithNotification,
    isLoading: addToCart.isPending,
    error: addToCart.error,
  };
}

/**
 * Hook for updating cart line item quantity
 */
export function useUpdateCartLineItem() {
  const queryClient = useQueryClient();
  const { syncFromCartPayload } = useCartSummary();
  const { customer } = useAuth();

  return useMutation({
    mutationFn: async ({ lineId, quantity }: UpdateLineItemParams) => {
      const response = await fetch(
        `/api/medusa/cart/line-items/${encodeURIComponent(lineId)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            ...buildCartHeaders(customer),
          },
          body: JSON.stringify({ quantity }),
          credentials: "include",
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          (payload && (payload.error || payload.message)) ||
          "Could not update quantity";
        throw new Error(message);
      }

      return (await response.json()) as CartApiPayload;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["cart"] });
    },
    onSuccess: (data, variables) => {
      if (data) {
        syncFromCartPayload(data);
      }
      invalidateCartQuery(queryClient);
      if (variables.label) {
        notifyQuantityUpdated(variables.label, variables.quantity);
      }
    },
  });
}

/**
 * Hook for removing a cart line item
 */
export function useRemoveCartLineItem() {
  const queryClient = useQueryClient();
  const { syncFromCartPayload } = useCartSummary();
  const { customer } = useAuth();

  return useMutation({
    mutationFn: async ({ lineId }: RemoveLineItemParams) => {
      const response = await fetch(
        `/api/medusa/cart/line-items/${encodeURIComponent(lineId)}`,
        {
          method: "DELETE",
          headers: {
            ...buildCartHeaders(customer),
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          (payload && (payload.error || payload.message)) ||
          "Could not remove item";
        throw new Error(message);
      }

      return (await response.json()) as CartApiPayload;
    },
    onSuccess: (data, variables) => {
      if (data) {
        syncFromCartPayload(data);
      }
      invalidateCartQuery(queryClient);
      if (variables.label) {
        notifyRemoveItem(variables.label);
      }
    },
  });
}

export function useUpdateCartLineQuantity() {
  const updateLineItem = useUpdateCartLineItem();
  const removeLineItem = useRemoveCartLineItem();

  const updateQuantity = async (
    lineId: string,
    nextQuantity: number,
    label?: string
  ) => {
    if (nextQuantity < 1) {
      return removeLineItem.mutateAsync({ lineId, label });
    }
    return updateLineItem.mutateAsync({ lineId, quantity: nextQuantity, label });
  };

  return {
    updateQuantity,
    isUpdating: updateLineItem.isPending || removeLineItem.isPending,
  };
}

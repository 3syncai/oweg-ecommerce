// useCartMutations: React Query hooks for cart operations

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCartSummary } from "@/contexts/CartProvider";
import {
  notifyCartAddError,
  notifyCartAddSuccess,
  notifyCartUnavailable,
} from "@/lib/notifications";
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

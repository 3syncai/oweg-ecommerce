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
import { useAuth } from "@/contexts/AuthProvider";

type AddToCartParams = {
  variant_id: string;
  quantity?: number;
};

type AddToCartResponse = {
  cart?: unknown;
  id?: string;
  [key: string]: unknown;
};

/**
 * Hook for adding items to cart using React Query
 */
export function useAddToCart() {
  const queryClient = useQueryClient();
  const { syncFromCartPayload } = useCartSummary();
  const { customer } = useAuth();

  return useMutation({
    mutationFn: async ({ variant_id, quantity = 1 }: AddToCartParams) => {
      // Ensure cart exists
      const cartRes = await fetch("/api/medusa/cart", {
        method: "POST",
        credentials: "include",
        headers: {
          ...(getGuestCartId() && !customer ? { "x-guest-cart-id": getGuestCartId()! } : {}),
        },
      });

      const cartData = await cartRes.json();
      
      // If guest cart ID is returned, store it in localStorage
      if (cartData.guestCartId && !customer) {
        setGuestCartId(cartData.guestCartId);
      }

      // Add line item
      const response = await fetch("/api/medusa/cart/line-items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(getGuestCartId() && !customer ? { "x-guest-cart-id": getGuestCartId()! } : {}),
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
      
      // If guest cart ID is returned, store it in localStorage
      if (payload.guestCartId && !customer) {
        setGuestCartId(payload.guestCartId);
      }

      return payload;
    },
    onSuccess: (data) => {
      // Sync cart count
      if (data) {
        syncFromCartPayload(data as unknown as Parameters<
          typeof syncFromCartPayload
        >[0]);
      }
      // Invalidate cart queries
      queryClient.invalidateQueries({ queryKey: ["cart"] });
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

    try {
      const result = await addToCart.mutateAsync({ variant_id, quantity: 1 });
      notifyCartAddSuccess(productName || "Product", 1, () =>
        router.push("/cart")
      );
      return result;
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


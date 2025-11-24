// useWishlistMutations: React Query hooks for wishlist operations

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import {
  notifyCartAddError,
  notifyWishlistLogin,
  notifyWishlistSuccess,
} from "@/lib/notifications";
import { useRouter } from "next/navigation";

type WishlistResponse = {
  wishlist?: string[];
  error?: string;
  message?: string;
};

/**
 * Hook for toggling wishlist items using React Query
 */
export function useToggleWishlist() {
  const queryClient = useQueryClient();
  const { customer, setCustomer } = useAuth();

  return useMutation({
    mutationFn: async (productId: string | number) => {
      const response = await fetch("/api/medusa/wishlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId: String(productId) }),
      });

      const data = (await response.json()) as WishlistResponse;

      if (!response.ok) {
        const message =
          (data && (data.error || data.message)) ||
          "Unable to save to wishlist.";
        throw new Error(message);
      }

      return data;
    },
    onSuccess: (data) => {
      // Update customer metadata with new wishlist
      if (data?.wishlist && Array.isArray(data.wishlist) && customer) {
        setCustomer({
          ...customer,
          metadata: {
            ...(customer.metadata || {}),
            wishlist: data.wishlist,
          },
        });
      }
      // Invalidate wishlist queries
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    },
  });
}

/**
 * Hook for adding product to wishlist with notifications
 */
export function useAddToWishlistWithNotification(productName?: string) {
  const toggleWishlist = useToggleWishlist();
  const { customer } = useAuth();
  const router = useRouter();

  const addToWishlist = async (productId: string | number) => {
    if (!customer) {
      notifyWishlistLogin(() => router.push("/login"));
      return;
    }

    try {
      const result = await toggleWishlist.mutateAsync(productId);
      notifyWishlistSuccess(productName || "Product");
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to save to wishlist.";
      notifyCartAddError(message);
      throw err;
    }
  };

  return {
    addToWishlist,
    isLoading: toggleWishlist.isPending,
    error: toggleWishlist.error,
  };
}


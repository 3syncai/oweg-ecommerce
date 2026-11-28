// useWishlistMutations: React Query hooks for wishlist operations

"use client";

import { useRef, useSyncExternalStore } from "react";
import { claimWishlist, releaseWishlist, queueWishlist, subscribeWishlist, wishlistVersion, wishlistPending } from "@/lib/wishlist-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import {
  announceAction,
  notifyActionError,
  notifyWishlistLogin,
  notifyWishlistSuccess,
} from "@/lib/notifications";
import { useRouter, usePathname } from "next/navigation";
import { buildLoginUrl } from "@/lib/auth-redirect";

type WishlistResponse = {
  wishlist?: string[];
  error?: string;
  message?: string;
};

// All writers share one queue and one pending registry, including PDP/removal.
export function useToggleWishlist() {
  const queryClient = useQueryClient();
  const { customer, updateWishlist } = useAuth();
  const identity = useRef(customer?.id);
  identity.current = customer?.id;
  useSyncExternalStore(subscribeWishlist, wishlistVersion, () => 0);
  const mutation = useMutation({
    retry: false,
    mutationFn: async (input: string | number | { productId: string; saved: boolean }) => {
      const productId = String(typeof input === "object" ? input.productId : input);
      const saved = typeof input === "object" ? input.saved : true;
      const id = customer?.id;
      if (!id) throw new Error("Please sign in to update wishlist.");
      const key = `${id}:${productId}`;
      if (!claimWishlist(key)) return {} as WishlistResponse;
      try {
        return await queueWishlist(async () => {
          if (identity.current !== id) throw new Error("Your account changed. Please try again.");
          let before: string[] = [];
          let sameSession = false;
          updateWishlist(id, ids => { sameSession = true; before = ids; return saved ? [...new Set([...ids, productId])] : ids.filter(value => value !== productId); });
          if (!sameSession) throw new Error("Your account changed. Please try again.");
          try {
            const response = await fetch("/api/medusa/wishlist", {
              method: saved ? "POST" : "DELETE",
              headers: { "content-type": "application/json" }, credentials: "include",
              signal: AbortSignal.timeout(15_000), body: JSON.stringify({ productId }),
            });
            const data = await response.json() as WishlistResponse;
            if (!response.ok || !Array.isArray(data.wishlist)) throw new Error(data.error || data.message || "Unable to update wishlist.");
            updateWishlist(id, () => data.wishlist!);
            try { localStorage.setItem("oweg_wishlist_updated", `${id}:${Date.now()}:${Math.random()}`); } catch { /* Storage may be disabled. */ }
            return data;
          } catch (error) {
            updateWishlist(id, () => before);
            // An interrupted response may still have committed; reconcile safely
            // with GET, never repeat a mutation automatically.
            try {
              const response = await fetch("/api/medusa/wishlist?ids=1", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(5_000) });
              const data = await response.json();
              if (response.ok && data.customer?.id === id && Array.isArray(data.wishlist)) updateWishlist(id, () => data.wishlist);
            } catch { /* Keep rollback; focus/retry will reconcile later. */ }
            throw error;
          } finally {
            void queryClient.invalidateQueries({ queryKey: ["wishlist", id] });
          }
        });
      } finally { releaseWishlist(key); }
    },
  });
  return { ...mutation, isPending: mutation.isPending || Boolean(customer?.id && wishlistPending(customer.id)) };
}

/** Apply a card's wishlist intent through the shared mutation and feedback. */
export function useSetWishlistWithNotification() {
  const toggleWishlist = useToggleWishlist();
  const { customer } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const setWishlist = async (productId: string | number, saved: boolean) => {
    if (!customer) {
      notifyWishlistLogin(() => router.push(buildLoginUrl(pathname)));
      return;
    }

    const id = String(productId);
    const actionError = saved ? "Unable to save to wishlist." : "Unable to remove from wishlist.";
    try {
      const result = await toggleWishlist.mutateAsync({ productId: id, saved });
      if (result.wishlist && result.wishlist.includes(id) === saved) {
        if (saved) notifyWishlistSuccess();
        else announceAction("Removed from wishlist");
        return true;
      }
    } catch (error) {
      notifyActionError(actionError, error instanceof Error ? error.message : "Please try again.");
    }
    return false;
  };

  return { setWishlist, isLoading: toggleWishlist.isPending };
}

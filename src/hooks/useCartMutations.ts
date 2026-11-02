"use client";

import { beginCartFlight, settleCartFlight, type CartFlight } from "@/lib/cart-flight";
import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { getCartQueryKey, writeCartQueryCache } from "@/hooks/useCart";
import { queueCartWrite, writeCart } from "@/lib/cart-client";
import { clearStaleBuyNowSnapshot } from "@/lib/checkout-redirects";
import { warmRazorpayCheckout } from "@/lib/razorpay-warmup";
import { notifyCartAddError, notifyCartAddSuccess, notifyCartUnavailable, notifyQuantityUpdated, notifyRemoveItem } from "@/lib/notifications";

export const CART_MUTATION_KEY = ["cart-mutation"] as const;
type AddToCartParams = { variant_id: string; quantity?: number; seller_selected?: boolean; animationSource?: CartFlight };
type UpdateLineItemParams = { lineId: string; quantity: number; label?: string };
type RemoveLineItemParams = { lineId: string; label?: string };

function useCartWriter() {
  const queryClient = useQueryClient();
  const { customer } = useAuth();
  const identity = customer?.id;
  const identityRef = useRef(identity);
  useEffect(() => { identityRef.current = identity; }, [identity]);
  return (path: string, method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>) =>
    queueCartWrite(async () => {
      if (identityRef.current !== identity) throw new Error("Your session changed. Please try again.");
      const queryKey = getCartQueryKey(identity);
      await queryClient.cancelQueries({ queryKey, exact: true });
      try {
        const data = await writeCart(path, method, body);
        if (identityRef.current === identity) writeCartQueryCache(queryClient, identity, data);
        // storage events notify other tabs; this tab already has the authoritative response.
        try { localStorage.setItem("oweg_cart_updated", `${Date.now()}:${Math.random()}`); } catch { /* storage may be disabled */ }
        return data;
      } catch (error) {
        // Reconcile an uncertain outcome with GET, never by replaying the write.
        // Do not await: readCart waits until this queued operation has finished.
        void queryClient.invalidateQueries({ queryKey, exact: true });
        throw error;
      }
    });
}

// Per-tab deduplication closes the gap before React disables a rapidly tapped
// button, including two mounted cards for the same variant. Cross-tab ordering
// stays on the existing cart writer/Web Lock path.
const pendingAdds = new Map<string, Promise<Awaited<ReturnType<typeof writeCart>>>>();
export function useAddToCart() {
  const write = useCartWriter();
  const { customer } = useAuth();
  return useMutation({
    mutationKey: CART_MUTATION_KEY,
    retry: false,
    mutationFn: ({ variant_id, quantity = 1, seller_selected, animationSource }: AddToCartParams) => {
      const key = JSON.stringify([customer?.id ?? "guest", variant_id, quantity, seller_selected]);
      const existing = pendingAdds.get(key);
      if (existing) return existing;
      // Motion is provisional feedback. It never increments the count itself.
      const flight = beginCartFlight(animationSource);
      const request = write("/api/medusa/cart/line-items", "POST", { variant_id, quantity, seller_selected })
        .then(data => { settleCartFlight(flight, true); return data; }, error => { settleCartFlight(flight, false); throw error; })
        .finally(() => { if (pendingAdds.get(key) === request) pendingAdds.delete(key); });
      pendingAdds.set(key, request);
      return request;
    },
    onSuccess: () => { clearStaleBuyNowSnapshot(); warmRazorpayCheckout(); },
  });
}

export function useAddToCartWithNotification(productName?: string) {
  const addToCart = useAddToCart();
  const router = useRouter();
  const addToCartWithNotification = async (variant_id: string, animationSource?: CartFlight) => {
    if (!variant_id) { notifyCartUnavailable(); return; }
    try {
      const result = await addToCart.mutateAsync({ variant_id, quantity: 1, animationSource });
      // View cart is offered only after the cart identity/items have been saved.
      notifyCartAddSuccess(productName || "Product", 1, () => router.push("/cart"));
      return result;
    } catch (error) {
      notifyCartAddError(error instanceof Error ? error.message : "Could not add to cart");
      throw error;
    }
  };
  return { addToCart: addToCartWithNotification, isLoading: addToCart.isPending, error: addToCart.error };
}

export function useUpdateCartLineItem() {
  const write = useCartWriter();
  return useMutation({
    mutationKey: CART_MUTATION_KEY,
    retry: false,
    mutationFn: ({ lineId, quantity }: UpdateLineItemParams) =>
      write(`/api/medusa/cart/line-items/${encodeURIComponent(lineId)}`, "PATCH", { quantity }),
    onSuccess: (_data, variables) => {
      if (variables.label) notifyQuantityUpdated(variables.label, variables.quantity);
    },
  });
}

export function useRemoveCartLineItem() {
  const write = useCartWriter();
  return useMutation({
    mutationKey: CART_MUTATION_KEY,
    retry: false,
    mutationFn: ({ lineId }: RemoveLineItemParams) =>
      write(`/api/medusa/cart/line-items/${encodeURIComponent(lineId)}`, "DELETE"),
    onSuccess: (_data, variables) => { if (variables.label) notifyRemoveItem(variables.label); },
  });
}

export function useUpdateCartLineQuantity() {
  const update = useUpdateCartLineItem();
  const remove = useRemoveCartLineItem();
  return {
    updateQuantity: (lineId: string, quantity: number, label?: string) => quantity < 1
      ? remove.mutateAsync({ lineId, label }) : update.mutateAsync({ lineId, quantity, label }),
    isUpdating: update.isPending || remove.isPending,
  };
}

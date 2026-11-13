"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { useCart, getCartQueryKey, writeCartQueryCache } from "@/hooks/useCart";
import { extractCartCount, type CartApiPayload } from "@/lib/cart-helpers";

type CartSummaryContextValue = {
  count: number;
  refresh: () => Promise<void>;
  syncFromCartPayload: (payload?: CartApiPayload) => void;
};
const CartSummaryContext = createContext<CartSummaryContextValue | undefined>(undefined);
const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function CartProvider({ children }: { children: ReactNode }) {
  const { customer } = useAuth();
  const queryClient = useQueryClient();
  const { data, refetch } = useCart();
  const count = extractCartCount(data);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === "oweg_cart_updated" || event.key === "guest_cart_id") {
        void queryClient.invalidateQueries({ queryKey: getCartQueryKey(customer?.id), exact: true });
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [queryClient, customer?.id]);
  const refresh = useCallback(async () => { await refetch(); }, [refetch]);
  const syncFromCartPayload = useCallback((payload?: CartApiPayload) => {
    writeCartQueryCache(queryClient, customer?.id, payload);
  }, [queryClient, customer?.id]);
  const value = useMemo(() => ({ count, refresh, syncFromCartPayload }), [count, refresh, syncFromCartPayload]);
  return <CartSummaryContext.Provider value={value}>{children}</CartSummaryContext.Provider>;
}

export function useCartSummary(): CartSummaryContextValue {
  const value = useContext(CartSummaryContext);
  // Each consumer can hydrate after the provider has already loaded the cart.
  const hydrated = useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot);
  const summary = useMemo(
    () => value && (hydrated ? value : { ...value, count: 0 }),
    [hydrated, value]
  );
  if (!summary) throw new Error("useCartSummary must be used within CartProvider");
  return summary;
}

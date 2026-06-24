"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { extractCartCount, type CartApiPayload } from "@/lib/cart-helpers";
import { warmRazorpayCheckout } from "@/lib/razorpay-warmup";

type CartSummaryContextValue = {
  count: number;
  refresh: () => Promise<void>;
  syncFromCartPayload: (payload?: CartApiPayload) => void;
  bumpCount: (delta: number) => void;
  restoreCount: (value: number) => void;
};

const CartSummaryContext = createContext<CartSummaryContextValue | undefined>(undefined);

type CartProviderProps = {
  children: React.ReactNode;
};

const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const { customer } = useAuth();
  const [count, setCount] = useState(0);
  const previousCustomerIdRef = useRef<string | undefined>(customer?.id);
  const razorpayWarmedRef = useRef(false);

  const syncFromCartPayload = useCallback((payload?: CartApiPayload) => {
    const next = extractCartCount(payload);
    setCount(next);
  }, []);

  const bumpCount = useCallback((delta: number) => {
    if (!Number.isFinite(delta) || delta === 0) return;
    setCount((prev) => Math.max(0, prev + delta));
  }, []);

  const restoreCount = useCallback((value: number) => {
    setCount(Math.max(0, value));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const guestCartId = typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null;
      const res = await fetch("/api/medusa/cart", {
        cache: "no-store",
        credentials: "include",
        headers: {
          ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
        },
      });
      if (!res.ok) return;
      const data = (await res.json()) as CartApiPayload;

      if (data.guestCartId && typeof window !== "undefined" && typeof data.guestCartId === "string") {
        localStorage.setItem("guest_cart_id", data.guestCartId);
      }

      syncFromCartPayload(data);
    } catch (err) {
      console.error("Failed to refresh cart", err);
    }
  }, [syncFromCartPayload]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const previousId = previousCustomerIdRef.current;
    const nextId = customer?.id;

    if (previousId && !nextId) {
      restoreCount(0);
      void refresh();
    }

    previousCustomerIdRef.current = nextId;
  }, [customer?.id, refresh, restoreCount]);

  useEffect(() => {
    if (count <= 0 || razorpayWarmedRef.current) return;
    razorpayWarmedRef.current = true;
    warmRazorpayCheckout({ prefetchMethods: true });
  }, [count]);

  const value = useMemo(
    () => ({
      count,
      refresh,
      syncFromCartPayload,
      bumpCount,
      restoreCount,
    }),
    [count, refresh, syncFromCartPayload, bumpCount, restoreCount]
  );

  return <CartSummaryContext.Provider value={value}>{children}</CartSummaryContext.Provider>;
};

export const useCartSummary = (): CartSummaryContextValue => {
  const ctx = useContext(CartSummaryContext);
  if (!ctx) {
    throw new Error("useCartSummary must be used within CartProvider");
  }
  return ctx;
};

export default CartProvider;

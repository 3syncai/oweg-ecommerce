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

type InFlightRefresh = {
  identity: string;
  promise: Promise<void>;
};

let cartRefreshInFlight: InFlightRefresh | null = null;

function cartIdentity(customerId?: string | null) {
  return customerId ? `user:${customerId}` : "guest";
}

const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const { customer } = useAuth();
  const [count, setCount] = useState(0);
  const previousCustomerIdRef = useRef<string | undefined>(customer?.id);
  const refreshGenerationRef = useRef(0);

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
    const identity = cartIdentity(customer?.id);
    if (cartRefreshInFlight && cartRefreshInFlight.identity === identity) {
      await cartRefreshInFlight.promise;
      return;
    }

    const generation = ++refreshGenerationRef.current;
    let promise!: Promise<void>;
    promise = (async () => {
      try {
        const guestCartId =
          typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null;
        const res = await fetch("/api/medusa/cart", {
          cache: "no-store",
          credentials: "include",
          headers: {
            ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
          },
        });
        if (!res.ok) return;
        const data = (await res.json()) as CartApiPayload;

        // Discard responses from obsolete identity/generation (e.g. after logout)
        if (generation !== refreshGenerationRef.current) return;
        if (cartIdentity(customer?.id) !== identity) return;

        if (data.guestCartId && typeof window !== "undefined" && typeof data.guestCartId === "string") {
          localStorage.setItem("guest_cart_id", data.guestCartId);
        }

        syncFromCartPayload(data);
      } catch (err) {
        console.error("Failed to refresh cart", err);
      } finally {
        if (cartRefreshInFlight?.promise === promise) {
          cartRefreshInFlight = null;
        }
      }
    })();

    cartRefreshInFlight = { identity, promise };
    await promise;
  }, [customer?.id, syncFromCartPayload]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const previousId = previousCustomerIdRef.current;
    const nextId = customer?.id;

    if (previousId && !nextId) {
      refreshGenerationRef.current += 1;
      cartRefreshInFlight = null;
      restoreCount(0);
      void refresh();
    }

    previousCustomerIdRef.current = nextId;
  }, [customer?.id, refresh, restoreCount]);

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

import type { QueryClient } from "@tanstack/react-query";
import { clearStaleBuyNowSnapshot } from "@/lib/checkout-redirects";
import { clearGuestCartId } from "@/lib/guest-cart";
import { clearCartQueryCache } from "@/hooks/useCart";

const USER_SCOPED_QUERY_PREFIXES = [
  "wishlist",
  "account-wallet",
  "account-orders-summary",
  "account-addresses",
  "account-settings",
  "customer-preferences",
] as const;

/**
 * Clears user-scoped React Query caches and session localStorage on logout.
 * Public catalog caches (home-products, categories, etc.) are intentionally preserved.
 */
export function clearUserSessionCache(
  queryClient: QueryClient,
  customerId?: string | null
) {
  if (customerId) {
    clearCartQueryCache(queryClient, customerId);
    for (const prefix of USER_SCOPED_QUERY_PREFIXES) {
      queryClient.removeQueries({ queryKey: [prefix, customerId] });
    }
  }

  clearCartQueryCache(queryClient, null);
  clearGuestCartId();
  clearStaleBuyNowSnapshot();
}

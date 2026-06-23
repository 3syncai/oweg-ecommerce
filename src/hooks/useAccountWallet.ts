"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";

export type WalletTransaction = {
  id?: string;
  amount?: number;
  status?: string;
  created_at?: string;
  type?: string;
  description?: string;
  [key: string]: unknown;
};

export type AccountWalletSnapshot = {
  balance: number;
  display_balance: number;
  actual_balance: number;
  pending_adjustment: number;
  lifetime_earned?: number;
  lifetime_spent?: number;
  adjustment_message?: string | null;
  can_redeem: boolean;
  expiring_soon: number;
  pending_coins: number;
  locked_coins: number;
  next_unlock: unknown;
  transactions: WalletTransaction[];
};

const ENDPOINT = "/api/store/wallet";

const emptyWallet = (): AccountWalletSnapshot => ({
  balance: 0,
  display_balance: 0,
  actual_balance: 0,
  pending_adjustment: 0,
  adjustment_message: null,
  can_redeem: false,
  expiring_soon: 0,
  pending_coins: 0,
  locked_coins: 0,
  next_unlock: null,
  transactions: [],
});

export function useAccountWallet() {
  const { customer } = useAuth();

  const walletQuery = useQuery<AccountWalletSnapshot>({
    queryKey: ["account-wallet", customer?.id],
    enabled: Boolean(customer?.id),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(ENDPOINT, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Unable to load wallet");
      const data = (await res.json()) as Partial<AccountWalletSnapshot>;
      return {
        ...emptyWallet(),
        ...data,
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
      };
    },
  });

  return {
    wallet: walletQuery.data ?? null,
    loading: walletQuery.isLoading,
    error: walletQuery.error instanceof Error ? walletQuery.error.message : null,
    refresh: walletQuery.refetch,
  };
}

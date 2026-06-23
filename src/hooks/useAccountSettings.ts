"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, type StoreCustomer } from "@/contexts/AuthProvider";
import {
  extractAccountSettings,
  normalizeAccountSettings,
  type AccountSettings,
} from "@/lib/account-settings";

type AccountSettingsResponse = {
  accountSettings?: AccountSettings | null;
  customer?: unknown;
};

const ENDPOINT = "/api/medusa/account-settings";

export function useAccountSettings() {
  const { customer, setCustomer } = useAuth();
  const queryClient = useQueryClient();

  const fallbackFromCustomer = useMemo(
    () =>
      extractAccountSettings(
        (customer?.metadata as Record<string, unknown> | null | undefined) ?? null
      ),
    [customer?.metadata]
  );

  const settingsQuery = useQuery<AccountSettings>({
    queryKey: ["account-settings", customer?.id],
    enabled: Boolean(customer),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(ENDPOINT, { cache: "no-store", credentials: "include" });
      if (res.status === 401) {
        return fallbackFromCustomer;
      }
      if (!res.ok) throw new Error("Unable to load account settings");
      const data = (await res.json()) as AccountSettingsResponse;
      if (data.customer) {
        setCustomer(data.customer as StoreCustomer);
      }
      return normalizeAccountSettings(data.accountSettings ?? (data as unknown));
    },
  });

  const saveMutation = useMutation<AccountSettings, Error, AccountSettings>({
    mutationFn: async (settings: AccountSettings) => {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accountSettings: settings }),
      });
      if (res.status === 401) throw new Error("Please sign in to save account settings.");
      if (!res.ok) throw new Error("Unable to save account settings right now.");
      const data = (await res.json()) as AccountSettingsResponse;
      if (data.customer) {
        setCustomer(data.customer as StoreCustomer);
      }
      return normalizeAccountSettings(data.accountSettings ?? (data as unknown));
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["account-settings", customer?.id], next);
    },
  });

  const accountSettings = settingsQuery.data ?? fallbackFromCustomer;

  const saveAccountSettings = useCallback(
    async (settings: AccountSettings) => {
      const saved = await saveMutation.mutateAsync(settings);
      queryClient.setQueryData(["account-settings", customer?.id], saved);
      return saved;
    },
    [customer?.id, queryClient, saveMutation]
  );

  return {
    accountSettings,
    loading: settingsQuery.isLoading,
    saving: saveMutation.isPending,
    saveAccountSettings,
    refresh: settingsQuery.refetch,
  };
}

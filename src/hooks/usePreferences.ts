"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, type StoreCustomer } from "@/contexts/AuthProvider";
import {
  hasAnyPreferences,
  normalizePreferences,
  type PreferenceProfile,
} from "@/lib/personalization";

type PreferencesResponse = {
  preferences?: PreferenceProfile | null;
  customer?: unknown;
};

const ENDPOINT = "/api/medusa/preferences";

export function usePreferences() {
  const { customer, setCustomer } = useAuth();
  const queryClient = useQueryClient();

  const fallbackFromCustomer = useMemo(
    () =>
      normalizePreferences(
        (customer?.metadata as Record<string, unknown> | null | undefined)?.preferences
      ),
    [customer?.metadata]
  );

  const preferencesQuery = useQuery<PreferenceProfile | null>({
    queryKey: ["customer-preferences", customer?.id],
    enabled: Boolean(customer),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Unable to load preferences");
      const data = (await res.json()) as PreferencesResponse;
      if (data.customer) {
        setCustomer(data.customer as StoreCustomer);
      }
      return normalizePreferences(data.preferences ?? (data as unknown));
    },
  });

  const saveMutation = useMutation<PreferenceProfile | null, Error, PreferenceProfile>({
    mutationFn: async (prefs: PreferenceProfile) => {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences: prefs }),
      });
      if (res.status === 401) throw new Error("Please sign in to save preferences.");
      if (!res.ok) throw new Error("Unable to save preferences right now.");
      const data = (await res.json()) as PreferencesResponse;
      if (data.customer) {
        setCustomer(data.customer as StoreCustomer);
      }
      return normalizePreferences(data.preferences ?? (data as unknown));
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["customer-preferences", customer?.id], next);
    },
  });

  const preferences = preferencesQuery.data ?? fallbackFromCustomer ?? null;
  const hasPreferences = hasAnyPreferences(preferences);

  const savePreferences = useCallback(
    async (prefs: PreferenceProfile) => {
      const saved = await saveMutation.mutateAsync(prefs);
      queryClient.setQueryData(["customer-preferences", customer?.id], saved);
      return saved;
    },
    [customer?.id, queryClient, saveMutation]
  );

  const shouldPrompt =
    Boolean(customer) &&
    !preferencesQuery.isLoading &&
    !saveMutation.isPending &&
    !hasPreferences;

  return {
    preferences,
    hasPreferences,
    loading: preferencesQuery.isLoading,
    saving: saveMutation.isPending,
    savePreferences,
    refresh: preferencesQuery.refetch,
    shouldPrompt,
  };
}

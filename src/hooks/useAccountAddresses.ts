"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";

export type CustomerAddress = {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country_code?: string;
  is_default_shipping?: boolean;
  is_default_billing?: boolean;
  company?: string;
  metadata?: Record<string, unknown>;
};

export type CustomerAddressInput = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country_code?: string;
  company?: string;
  is_default_shipping?: boolean;
  is_default_billing?: boolean;
  metadata?: Record<string, unknown>;
};

type AddressesResponse = {
  addresses?: CustomerAddress[];
  customer?: { addresses?: CustomerAddress[] };
};

const LIST_ENDPOINT = "/api/medusa/customer-addresses";

function extractAddresses(data: AddressesResponse): CustomerAddress[] {
  const list = data.addresses || data.customer?.addresses || [];
  return Array.isArray(list) ? list.filter((item) => Boolean(item?.id)) : [];
}

export function useAccountAddresses() {
  const { customer } = useAuth();
  const queryClient = useQueryClient();

  const addressesQuery = useQuery<CustomerAddress[]>({
    queryKey: ["account-addresses", customer?.id],
    enabled: Boolean(customer?.id),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(LIST_ENDPOINT, {
        cache: "no-store",
        credentials: "include",
      });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Unable to load addresses");
      const data = (await res.json()) as AddressesResponse;
      return extractAddresses(data);
    },
  });

  const invalidateAddresses = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["account-addresses", customer?.id] });
  }, [customer?.id, queryClient]);

  const saveMutation = useMutation<CustomerAddress, Error, CustomerAddressInput>({
    mutationFn: async (input) => {
      const res = await fetch(LIST_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (res.status === 401) throw new Error("Please sign in to save an address.");
      if (!res.ok) throw new Error("Unable to save address right now.");
      const data = (await res.json()) as { address?: CustomerAddress; customer?: { addresses?: CustomerAddress[] } };
      const created = data.address;
      if (created?.id) return created;
      const fromList = extractAddresses(data as AddressesResponse);
      const match = fromList[fromList.length - 1];
      if (match?.id) return match;
      throw new Error("Address saved but response was incomplete.");
    },
    onSuccess: () => {
      void invalidateAddresses();
    },
  });

  const updateMutation = useMutation<CustomerAddress, Error, { id: string; input: CustomerAddressInput }>({
    mutationFn: async ({ id, input }) => {
      const res = await fetch(`${LIST_ENDPOINT}/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (res.status === 401) throw new Error("Please sign in to update an address.");
      if (!res.ok) throw new Error("Unable to update address right now.");
      const data = (await res.json()) as { address?: CustomerAddress };
      if (data.address?.id) return data.address;
      return { id, ...input };
    },
    onSuccess: () => {
      void invalidateAddresses();
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`${LIST_ENDPOINT}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 401) throw new Error("Please sign in to delete an address.");
      if (!res.ok) throw new Error("Unable to delete address right now.");
    },
    onSuccess: () => {
      void invalidateAddresses();
    },
  });

  const setDefaultMutation = useMutation<
    CustomerAddress,
    Error,
    { id: string; type: "shipping" | "billing" | "both" }
  >({
    mutationFn: async ({ id, type }) => {
      const payload: CustomerAddressInput =
        type === "shipping"
          ? { is_default_shipping: true }
          : type === "billing"
            ? { is_default_billing: true }
            : { is_default_shipping: true, is_default_billing: true };

      const res = await fetch(`${LIST_ENDPOINT}/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.status === 401) throw new Error("Please sign in to update default address.");
      if (!res.ok) throw new Error("Unable to set default address right now.");
      const data = (await res.json()) as { address?: CustomerAddress };
      if (data.address?.id) return data.address;
      return { id, ...payload };
    },
    onSuccess: () => {
      void invalidateAddresses();
    },
  });

  const saveAddress = useCallback(
    async (input: CustomerAddressInput) => saveMutation.mutateAsync(input),
    [saveMutation]
  );

  const updateAddress = useCallback(
    async (id: string, input: CustomerAddressInput) => updateMutation.mutateAsync({ id, input }),
    [updateMutation]
  );

  const deleteAddress = useCallback(
    async (id: string) => deleteMutation.mutateAsync(id),
    [deleteMutation]
  );

  const setDefaultAddress = useCallback(
    async (id: string, type: "shipping" | "billing" | "both" = "both") =>
      setDefaultMutation.mutateAsync({ id, type }),
    [setDefaultMutation]
  );

  return {
    addresses: addressesQuery.data ?? [],
    loading: addressesQuery.isLoading,
    saving: saveMutation.isPending || updateMutation.isPending || setDefaultMutation.isPending,
    deleting: deleteMutation.isPending,
    error: addressesQuery.error instanceof Error ? addressesQuery.error.message : null,
    saveAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    refresh: addressesQuery.refetch,
  };
}

"use client";

import { useQuery } from "@tanstack/react-query";
import type { MedusaCategory } from "@/services/medusa";

export const STORE_CATEGORIES_QUERY_KEY = ["store-categories"] as const;

async function fetchStoreCategories(): Promise<MedusaCategory[]> {
  const res = await fetch("/api/medusa/categories");
  if (!res.ok) {
    throw new Error("Unable to load categories");
  }
  const data = await res.json();
  return Array.isArray(data.categories) ? (data.categories as MedusaCategory[]) : [];
}

export function useStoreCategories() {
  return useQuery({
    queryKey: STORE_CATEGORIES_QUERY_KEY,
    queryFn: fetchStoreCategories,
    staleTime: 1000 * 60 * 10,
  });
}

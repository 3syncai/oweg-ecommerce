// Custom hook: Fetch all categories using TanStack Query

import { useQuery } from "@tanstack/react-query";
import { getCategoriesService, type MedusaCategory } from "@/services/medusa";

export function useCategories() {
  return useQuery<MedusaCategory[], Error>({
    queryKey: ["categories"],
    queryFn: getCategoriesService,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}


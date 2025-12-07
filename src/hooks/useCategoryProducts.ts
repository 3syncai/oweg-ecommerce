// Custom hook: Fetch and manage products for a category using TanStack Query

import { useQuery } from "@tanstack/react-query";
import {
  getProductsByCategoryService,
  type CategoryProductQueryParams,
  type UIProduct,
} from "@/services/medusa";

export function useCategoryProducts(
  categoryId: string | undefined,
  query: CategoryProductQueryParams = {},
  initialData?: UIProduct[]
) {
  return useQuery<UIProduct[], Error>({
    queryKey: ["category-products", categoryId, query],
    queryFn: () => {
      if (!categoryId) throw new Error("Category ID required");
      return getProductsByCategoryService(categoryId, query);
    },
    enabled: !!categoryId,
    initialData,
    placeholderData: initialData,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}


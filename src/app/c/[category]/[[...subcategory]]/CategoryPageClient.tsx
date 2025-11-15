// CategoryPageClient: Client-side category page with filters and product grid

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CategoryHeader } from "@/components/modules/CategoryHeader";
import {
  DealPreview,
  FilterSidebar,
  FilterState,
} from "@/components/modules/FilterSidebar";
import { ProductGrid } from "@/components/modules/ProductGrid";
import { useCategoryProducts } from "@/hooks/useCategoryProducts";
import type { MedusaCategory } from "@/services/medusa";
import { SectionHeading } from "@/components/ui/section-heading";

type CategoryPageClientProps = {
  category: MedusaCategory;
  subcategories: MedusaCategory[];
  selectedSubcategory?: MedusaCategory;
  categoryHandle: string;
  subcategoryHandle?: string;
};

export function CategoryPageClient({
  category,
  subcategories,
  selectedSubcategory,
  categoryHandle,
  subcategoryHandle,
}: CategoryPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parseNumberParam = useCallback((value: string | null) => {
    if (value === null) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, []);

  const [filters, setFilters] = useState<FilterState>(() => ({
    subcategories: [],
    ratings: [],
    brands: [],
    priceMin: parseNumberParam(searchParams?.get("price_min")),
    priceMax: parseNumberParam(searchParams?.get("price_max")),
    dealsOnly: searchParams?.get("deals") === "1",
  }));
  const [dealPreview, setDealPreview] = useState<DealPreview[]>([]);
  const [dealCount, setDealCount] = useState(0);

  // Determine which category ID to use for fetching products
  const activeCategoryId = selectedSubcategory?.id || category.id;
  const categoryTitle =
    selectedSubcategory?.title ||
    selectedSubcategory?.name ||
    category.title ||
    category.name ||
    "Products";

  // Fetch products for the active category
  const queryFilters = useMemo(
    () => ({
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      dealsOnly: filters.dealsOnly,
    }),
    [filters.priceMin, filters.priceMax, filters.dealsOnly]
  );

  const { data: products = [], isLoading } = useCategoryProducts(
    activeCategoryId,
    queryFilters
  );

  // Apply client-side filters
  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    if (filters.brands.length > 0) {
      filtered = filtered.filter((product) =>
        filters.brands.some((brand) =>
          product.name.toLowerCase().includes(brand.toLowerCase())
        )
      );
    }

    return filtered;
  }, [products, filters.brands]);

  const handleFilterChange = useCallback((partial: Partial<FilterState>) => {
    setFilters((prev) => ({
      ...prev,
      ...partial,
    }));
  }, []);

  useEffect(() => {
    if (!router || !pathname) return;
    const nextParams = new URLSearchParams(searchParams?.toString());

    const syncNumberParam = (key: string, value?: number) => {
      if (value !== undefined && Number.isFinite(value)) {
        nextParams.set(key, String(value));
      } else {
        nextParams.delete(key);
      }
    };

    syncNumberParam("price_min", filters.priceMin);
    syncNumberParam("price_max", filters.priceMax);

    if (filters.dealsOnly) {
      nextParams.set("deals", "1");
    } else {
      nextParams.delete("deals");
    }

    const next = nextParams.toString();
    if (next === searchParams?.toString()) {
      return;
    }

    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    filters.priceMin,
    filters.priceMax,
    filters.dealsOnly,
    pathname,
    router,
    searchParams,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadDealPreview() {
      if (!activeCategoryId) {
        setDealPreview([]);
        setDealCount(0);
        return;
      }

      try {
        const params = new URLSearchParams({
          categoryId: activeCategoryId,
          limit: "6",
        });
        const res = await fetch(
          `/api/medusa/deal-of-the-day?${params.toString()}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          throw new Error(`Failed to load deals: ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        const preview = Array.isArray(data.products) ? data.products : [];
        setDealPreview(preview);
        setDealCount(
          typeof data.total === "number"
            ? data.total
            : preview.length
        );
      } catch (error) {
        if (!cancelled) {
          setDealPreview([]);
          setDealCount(0);
        }
        console.warn("Failed fetching deals of the day", error);
      }
    }

    loadDealPreview();
    return () => {
      cancelled = true;
    };
  }, [activeCategoryId]);

  const headingDescription = isLoading
    ? "Loading products…"
    : `${filteredProducts.length} products available`;

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Main Content Area */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Left Sidebar - Filters */}
          <aside className="hidden lg:block flex-shrink-0">
            <FilterSidebar
              categoryHandle={categoryHandle}
              subcategories={subcategories}
              filters={filters}
              onFilterChange={handleFilterChange}
              selectedSubcategory={subcategoryHandle}
              dealPreview={dealPreview}
              dealCount={dealCount}
            />
          </aside>

          {/* Main Product Area */}
          <main className="flex-1 min-w-0">
            {/* Category Header with Subcategories (only show if no subcategory selected) */}
            {!selectedSubcategory && subcategories.length > 0 && (
              <div className="mb-6 w-full">
                <SectionHeading title="Categories" className="mb-4" />
                <CategoryHeader
                  categoryHandle={categoryHandle}
                  subcategories={subcategories}
                />
              </div>
            )}

            {/* Page Title */}
            <div className="mb-6">
              <h1 className="sr-only">{categoryTitle}</h1>
              <SectionHeading title={categoryTitle} className="mb-2" />
              <p className="text-gray-600 mt-1 text-sm">
                {headingDescription}
              </p>
            </div>

            {/* Product Grid */}
            <ProductGrid
              products={filteredProducts}
              isLoading={isLoading}
              showEmpty={!isLoading && filteredProducts.length === 0}
            />
          </main>
        </div>
      </div>
    </div>
  );
}


"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CategoryHeader } from "@/components/modules/CategoryHeader";
import { CategoryPagination } from "@/components/modules/CategoryPagination";
import {
  DealPreview,
  FilterSidebar,
  FilterState,
} from "@/components/modules/FilterSidebar";
import { ProductGrid } from "@/components/modules/ProductGrid";
import { useCategoryProducts } from "@/hooks/useCategoryProducts";
import type { MedusaCategory } from "@/services/medusa";
import { SectionHeading } from "@/components/ui/section-heading";

const PRODUCTS_PER_PAGE = 20;

function extractBrandFromName(name: string) {
  if (!name) return undefined;
  const normalized = name.trim();
  if (!normalized) return undefined;
  const tokens = normalized.split(/\s+/);
  if (tokens.length === 0) return undefined;
  const first = tokens[0]?.replace(/[^A-Za-z0-9&]/g, "");
  if (!first || first.length < 2) return undefined;

  const second = tokens[1]?.replace(/[^A-Za-z0-9&]/g, "");
  if (second && /^[A-Z]/.test(second) && second.length > 1) {
    return `${first} ${second}`.trim();
  }

  return first;
}

const DEFAULT_BRAND_OPTIONS = [
  "Nelkon",
  "Paras",
  "Syska",
  "Maharaja",
  "Crompton",
  "Oweg",
  "Bajaj",
  "Pigeon",
];

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

  const activeCategoryId = selectedSubcategory?.id || category.id;
  const categoryTitle =
    selectedSubcategory?.title ||
    selectedSubcategory?.name ||
    category.title ||
    category.name ||
    "Products";

  const includeSubcategories = !selectedSubcategory;
  const queryFilters = useMemo(
    () => ({
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      dealsOnly: filters.dealsOnly,
      includeSubcategories,
      limit: includeSubcategories ? 60 : 50,
    }),
    [filters.priceMin, filters.priceMax, filters.dealsOnly, includeSubcategories]
  );

  const { data: products = [], isLoading } = useCategoryProducts(
    activeCategoryId,
    queryFilters
  );

  const derivedBrandOptions = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      const brand = extractBrandFromName(product.name);
      if (brand) {
        counts.set(brand, (counts.get(brand) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .map(([brand]) => brand);
  }, [products]);

  const brandOptions = derivedBrandOptions.length
    ? derivedBrandOptions
    : DEFAULT_BRAND_OPTIONS;

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

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const requestedPage = Math.max(1, parseInt(searchParams?.get("page") || "1", 10) || 1);
  const currentPage = Math.min(requestedPage, totalPages);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(start, start + PRODUCTS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const activeSourceHandle =
    selectedSubcategory?.handle ||
    subcategoryHandle ||
    category.handle ||
    categoryHandle ||
    undefined;

  const normalizedHandle = activeSourceHandle
    ? activeSourceHandle.replace(/^\/+/, "")
    : undefined;

  const enrichedProducts = useMemo(() => {
    return paginatedProducts.map((product) => ({
      ...product,
      sourceCategoryId: activeCategoryId,
      sourceCategoryHandle: normalizedHandle,
    }));
  }, [paginatedProducts, activeCategoryId, normalizedHandle]);

  const handleFilterChange = useCallback(
    (partial: Partial<FilterState>) => {
      setFilters((prev) => ({
        ...prev,
        ...partial,
      }));

      if (!router || !pathname) return;
      const nextParams = new URLSearchParams(searchParams?.toString());
      nextParams.delete("page");
      const next = nextParams.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const goToPage = useCallback(
    (page: number) => {
      if (!router || !pathname) return;
      const safePage = Math.max(1, Math.min(page, totalPages));
      const nextParams = new URLSearchParams(searchParams?.toString());
      if (safePage <= 1) {
        nextParams.delete("page");
      } else {
        nextParams.set("page", String(safePage));
      }
      const next = nextParams.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [pathname, router, searchParams, totalPages]
  );

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
        if (includeSubcategories) {
          params.set("includeSubcategories", "1");
        }
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
  }, [activeCategoryId, includeSubcategories]);

  const headingDescription = isLoading
    ? "Loading products…"
    : `${filteredProducts.length} products available`;

  const resultsRangeStart =
    filteredProducts.length === 0 ? 0 : (currentPage - 1) * PRODUCTS_PER_PAGE + 1;
  const resultsRangeEnd = Math.min(currentPage * PRODUCTS_PER_PAGE, filteredProducts.length);

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          <aside
            className="hidden lg:block flex-shrink-0 w-80 sticky self-start z-10 top-[calc(var(--app-header-height,136px)+1rem)] max-h-[calc(100vh-var(--app-header-height,136px)-2rem)] overflow-y-auto overscroll-contain"
          >
            <FilterSidebar
              categoryHandle={categoryHandle}
              subcategories={subcategories}
              filters={filters}
              onFilterChange={handleFilterChange}
              selectedSubcategory={subcategoryHandle}
              dealPreview={dealPreview}
              dealCount={dealCount}
              brandOptions={brandOptions}
            />
          </aside>

          <main className="flex-1 min-w-0">
            {!selectedSubcategory && subcategories.length > 0 && (
              <div className="mb-6 w-full">
                <SectionHeading title="Categories" className="mb-4" />
                <CategoryHeader
                  categoryHandle={categoryHandle}
                  subcategories={subcategories}
                />
              </div>
            )}

            <div className="mb-6">
              <h1 className="sr-only">{categoryTitle}</h1>
              <SectionHeading title={categoryTitle} className="mb-2" />
              <p className="text-gray-600 mt-1 text-sm">
                {headingDescription}
                {!isLoading && filteredProducts.length > 0 && (
                  <span className="text-gray-500">
                    {" "}
                    · Showing {resultsRangeStart}–{resultsRangeEnd}
                  </span>
                )}
              </p>
            </div>

            <ProductGrid
              products={enrichedProducts}
              isLoading={isLoading}
              showEmpty={!isLoading && filteredProducts.length === 0}
            />

            {!isLoading && filteredProducts.length > 0 && (
              <CategoryPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={goToPage}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

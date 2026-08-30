"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
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
import type { CategoryProductsPage } from "@/services/medusa";
import { SectionHeading } from "@/components/ui/section-heading";
import HealthCareAgeGate from "@/components/modules/HealthCareAgeGate";
import {
  isHealthCareCategoryHandle,
  isHealthCarePath,
} from "@/lib/health-care-age-gate";
import type {
  CategoryDealPreview,
  CategoryPreviewMap,
} from "@/lib/category-listing";

const PRODUCTS_PER_PAGE = 20;

function normalizeBrandKey(brand: string) {
  return brand.trim().toLowerCase();
}

/** First-token-only fallback when product.brand is missing — never glues model names. */
function brandFromProductName(name: string) {
  if (!name) return undefined;
  const first = name
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^A-Za-z0-9&]/g, "");
  if (!first || first.length < 2) return undefined;
  return first;
}

function resolveUiBrand(product: { name: string; brand?: string }) {
  const fromField = product.brand?.trim();
  if (fromField) return fromField;
  return brandFromProductName(product.name);
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
  initialProducts?: CategoryProductsPage;
  initialDeals?: {
    products: CategoryDealPreview[];
    total: number;
    categoryId?: string;
  };
  initialCategoryPreviews?: CategoryPreviewMap;
};

export function CategoryPageClient({
  category,
  subcategories,
  selectedSubcategory,
  categoryHandle,
  subcategoryHandle,
  initialProducts,
  initialDeals,
  initialCategoryPreviews,
}: CategoryPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showHealthCareAgeGate =
    isHealthCareCategoryHandle(categoryHandle) || isHealthCarePath(pathname);

  const parseNumberParam = useCallback((value: string | null) => {
    if (value === null) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
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
  const [dealPreview, setDealPreview] = useState<DealPreview[]>(
    () => (initialDeals?.products as DealPreview[]) || []
  );
  const [dealCount, setDealCount] = useState(() => initialDeals?.total ?? 0);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const activeCategoryId = selectedSubcategory?.id || category.id;
  const categoryTitle =
    selectedSubcategory?.title ||
    selectedSubcategory?.name ||
    category.title ||
    category.name ||
    "Products";

  const requestedPage = Math.max(
    1,
    parseInt(searchParams?.get("page") || "1", 10) || 1,
  );
  const pageOffset = (requestedPage - 1) * PRODUCTS_PER_PAGE;

  const includeSubcategories = !selectedSubcategory;
  const queryFilters = useMemo(
    () => ({
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      dealsOnly: filters.dealsOnly,
      includeSubcategories,
      limit: PRODUCTS_PER_PAGE,
      offset: pageOffset,
    }),
    [
      filters.priceMin,
      filters.priceMax,
      filters.dealsOnly,
      includeSubcategories,
      pageOffset,
    ],
  );

  const { data: pageData, isLoading } = useCategoryProducts(
    activeCategoryId,
    queryFilters,
    initialProducts &&
      queryFilters.offset === (initialProducts.offset ?? 0) &&
      queryFilters.limit === (initialProducts.limit ?? PRODUCTS_PER_PAGE) &&
      Boolean(queryFilters.dealsOnly) ===
        Boolean(initialProducts.appliedDealsOnly) &&
      (queryFilters.priceMin ?? undefined) ===
        (initialProducts.appliedPriceMin ?? undefined) &&
      (queryFilters.priceMax ?? undefined) ===
        (initialProducts.appliedPriceMax ?? undefined)
      ? initialProducts
      : undefined,
  );

  const products = useMemo(
    () => pageData?.products ?? [],
    [pageData?.products],
  );
  const serverCount = pageData?.count ?? products.length;
  const serverHasMore = pageData?.hasMore ?? false;
  const brandFilterActive = filters.brands.length > 0;

  const derivedBrandOptions = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      const brand = resolveUiBrand(product);
      if (brand) {
        const key = normalizeBrandKey(brand);
        const existing = [...counts.keys()].find(
          (label) => normalizeBrandKey(label) === key,
        );
        const label = existing ?? brand;
        counts.set(label, (counts.get(label) ?? 0) + 1);
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
      const selected = new Set(
        filters.brands.map((brand) => normalizeBrandKey(brand)),
      );
      filtered = filtered.filter((product) => {
        const brand = resolveUiBrand(product);
        if (brand && selected.has(normalizeBrandKey(brand))) {
          return true;
        }
        if (!brand) {
          return filters.brands.some((selectedBrand) =>
            product.name.toLowerCase().includes(selectedBrand.toLowerCase()),
          );
        }
        return false;
      });
    }

    return filtered;
  }, [products, filters.brands]);

  const pagesFromCount = Math.max(
    1,
    Math.ceil(serverCount / PRODUCTS_PER_PAGE),
  );
  const totalPages = serverHasMore
    ? Math.max(pagesFromCount, Math.min(requestedPage, pagesFromCount) + 1)
    : pagesFromCount;
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);

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
    return filteredProducts.map((product) => ({
      ...product,
      sourceCategoryId: activeCategoryId,
      sourceCategoryHandle: normalizedHandle,
    }));
  }, [filteredProducts, activeCategoryId, normalizedHandle]);

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
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
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
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [pathname, router, searchParams, totalPages],
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
    if (
      initialDeals &&
      (!initialDeals.categoryId || initialDeals.categoryId === activeCategoryId)
    ) {
      setDealPreview((initialDeals.products as DealPreview[]) || []);
      setDealCount(initialDeals.total ?? 0);
      return;
    }

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
        );
        if (!res.ok) {
          throw new Error(`Failed to load deals: ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        const preview = Array.isArray(data.products) ? data.products : [];
        setDealPreview(preview);
        setDealCount(
          typeof data.total === "number" ? data.total : preview.length,
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
  }, [activeCategoryId, includeSubcategories, initialDeals]);

  // Lock background scroll and allow Escape while the mobile filter sheet is open.
  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFiltersOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileFiltersOpen]);

  const headingDescription = isLoading
    ? "Loading products…"
    : brandFilterActive
      ? `${filteredProducts.length} matching on this page · ${serverCount} in category`
      : `${serverCount} products available`;

  const resultsRangeStart = brandFilterActive
    ? filteredProducts.length === 0
      ? 0
      : 1
    : filteredProducts.length === 0
      ? 0
      : pageOffset + 1;
  const resultsRangeEnd = brandFilterActive
    ? filteredProducts.length
    : pageOffset + filteredProducts.length;

  const filterSidebar = (
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
  );

  return (
    <div className="oweg-page min-h-screen">
      <HealthCareAgeGate enabled={showHealthCareAgeGate} />
      <div className="oweg-container py-5 md:py-6">
        <div className="flex gap-6 xl:gap-8">
          <aside className="hidden lg:block flex-shrink-0 w-[clamp(240px,22vw,320px)] sticky self-start z-10 top-[calc(var(--app-header-height,136px)+1rem)] max-h-[calc(100vh-var(--app-header-height,136px)-2rem)] overflow-y-auto overscroll-contain">
            {filterSidebar}
          </aside>

          <main className="flex-1 min-w-0">
            {!selectedSubcategory && subcategories.length > 0 && (
              <div className="mb-6 w-full">
                <SectionHeading title="Categories" className="mb-4" />
                <CategoryHeader
                  categoryHandle={categoryHandle}
                  subcategories={subcategories}
                  initialPreviews={initialCategoryPreviews}
                />
              </div>
            )}

            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 md:mb-6">
              <div className="min-w-0">
                <h1 className="sr-only">{categoryTitle}</h1>
                <SectionHeading title={categoryTitle} className="mb-2" />
                <p className="mt-1 text-sm text-[var(--oweg-ink-muted)]">
                  {headingDescription}
                  {!isLoading && filteredProducts.length > 0 && (
                    <span className="text-gray-500">
                      {" "}
                      · Showing {resultsRangeStart}–{resultsRangeEnd}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="oweg-tap inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--oweg-border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--oweg-ink)] shadow-[var(--oweg-shadow-sm)] transition hover:border-[var(--oweg-green)] lg:hidden"
                aria-haspopup="dialog"
                aria-expanded={mobileFiltersOpen}
              >
                <SlidersHorizontal className="h-4 w-4 text-[var(--oweg-green-dark)]" />
                Filters
              </button>
            </div>

            <ProductGrid
              products={enrichedProducts}
              isLoading={isLoading}
              showEmpty={!isLoading && filteredProducts.length === 0}
            />

            {!isLoading && totalPages > 1 && (
              <CategoryPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={goToPage}
                hasMore={serverHasMore}
              />
            )}
          </main>
        </div>
      </div>

      {/* Mobile / tablet filter sheet — same state, same handlers */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[950] lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 h-full w-full bg-black/45 backdrop-blur-[2px]"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[var(--oweg-radius-xl)] bg-white shadow-[0_-20px_60px_-30px_rgba(0,0,0,0.5)]">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--oweg-border)] px-4 py-3">
              <p className="text-base font-semibold text-[var(--oweg-ink)]">Filters</p>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                aria-label="Close filters"
                className="oweg-tap flex items-center justify-center rounded-full border border-[var(--oweg-border-strong)] text-[var(--oweg-ink-soft)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {filterSidebar}
            </div>
            <div className="oweg-safe-bottom shrink-0 border-t border-[var(--oweg-border)] px-4 pt-3">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="oweg-tap w-full rounded-xl bg-[var(--oweg-green)] py-3 text-sm font-semibold text-white transition hover:bg-[var(--oweg-green-dark)]"
              >
                Show {filteredProducts.length} results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

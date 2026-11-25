"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { CategoryHeader } from "@/components/modules/CategoryHeader";
import { CategoryPagination } from "@/components/modules/CategoryPagination";
import { CategoryFilterDialog, FilterSidebar } from "@/components/modules/FilterSidebar";
import { ProductSortSelect } from "@/components/modules/ProductSortSelect";
import { parseCategoryBrands, parseCategoryPrice, type CategoryFilters } from "@/lib/category-filters";
import { parseProductSort, type ProductSort } from "@/lib/product-sort";
import { ProductGrid } from "@/components/modules/ProductGrid";
import { useCategoryProducts } from "@/hooks/useCategoryProducts";
import type { MedusaCategory } from "@/services/medusa";
import type { CategoryProductsPage } from "@/services/medusa";
import styles from "@/components/shopping/Shopping.module.css";
import HealthCareAgeGate from "@/components/modules/HealthCareAgeGate";
import {
  isHealthCareCategoryHandle,
  isHealthCarePath,
} from "@/lib/health-care-age-gate";

const PRODUCTS_PER_PAGE = 20;

type CategoryPageClientProps = {
  category: MedusaCategory;
  subcategories: MedusaCategory[];
  selectedSubcategory?: MedusaCategory;
  categoryHandle: string;
  subcategoryHandle?: string;
  initialProducts?: CategoryProductsPage;
};

export function CategoryPageClient({
  category,
  subcategories,
  selectedSubcategory,
  categoryHandle,
  subcategoryHandle,
  initialProducts,
}: CategoryPageClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showHealthCareAgeGate =
    isHealthCareCategoryHandle(categoryHandle) || isHealthCarePath(pathname);

  const filters = useMemo<CategoryFilters>(() => ({
    priceMin: parseCategoryPrice(searchParams.get("price_min")),
    priceMax: parseCategoryPrice(searchParams.get("price_max")),
    dealsOnly: searchParams.get("deals") === "1",
    brands: parseCategoryBrands(searchParams.getAll("brand")),
  }), [searchParams]);
  const sort = parseProductSort(searchParams.get("sort"));
  const [draftFilters, setDraftFilters] = useState<CategoryFilters | null>(null);

  const activeCategoryId = selectedSubcategory?.id || category.id;
  const categoryTitle =
    selectedSubcategory?.title ||
    selectedSubcategory?.name ||
    category.title ||
    category.name ||
    "Products";

  const pageNumber = Number(searchParams.get("page") || "1");
  const requestedPage = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const pageOffset = (requestedPage - 1) * PRODUCTS_PER_PAGE;

  const includeSubcategories = !selectedSubcategory;
  const queryFilters = useMemo(
    () => ({
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      dealsOnly: filters.dealsOnly,
      brands: filters.brands,
      sort,
      includeSubcategories,
      limit: PRODUCTS_PER_PAGE,
      offset: pageOffset,
    }),
    [
      filters.priceMin,
      filters.priceMax,
      filters.dealsOnly,
      filters.brands,
      sort,
      includeSubcategories,
      pageOffset,
    ],
  );

  const { data: pageData, isLoading, isError, refetch } = useCategoryProducts(
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
        (initialProducts.appliedPriceMax ?? undefined) &&
      queryFilters.sort === (initialProducts.appliedSort ?? "default") &&
      queryFilters.brands.join("\n") === (initialProducts.appliedBrands ?? []).join("\n")
      ? initialProducts
      : undefined,
  );

  const products = useMemo(
    () => pageData?.products ?? [],
    [pageData?.products],
  );
  const serverCount = pageData?.count ?? products.length;
  const serverHasMore = pageData?.hasMore ?? false;
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
    return products.map((product) => ({
      ...product,
      sourceCategoryId: activeCategoryId,
      sourceCategoryHandle: normalizedHandle,
    }));
  }, [products, activeCategoryId, normalizedHandle]);

  const updateQuery = useCallback((update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(window.location.search);
    update(params);
    const next = params.toString();
    if (next === window.location.search.slice(1)) return;
    window.history.pushState(null, "", next ? `${pathname}?${next}` : pathname);
  }, [pathname]);

  const handleFilterChange = (partial: Partial<CategoryFilters>) => {
    const next = { ...filters, ...partial };
    updateQuery(params => {
      params.delete("page");
      for (const [key, value] of [["price_min", next.priceMin], ["price_max", next.priceMax]] as const) {
        if (value === undefined) params.delete(key);
        else params.set(key, String(value));
      }
      if (next.dealsOnly) params.set("deals", "1");
      else params.delete("deals");
      params.delete("brand");
      parseCategoryBrands(next.brands).forEach(brand => params.append("brand", brand));
    });
  };

  const changeSort = (next: ProductSort) => {
    updateQuery(params => {
      params.delete("page");
      if (next === "default") params.delete("sort");
      else params.set("sort", next);
    });
  };

  const goToPage = (page: number) => {
    const safePage = Math.max(1, Math.min(page, totalPages));
    updateQuery(params => {
      if (safePage <= 1) params.delete("page");
      else params.set("page", String(safePage));
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const activeCount = filters.brands.length + Number(filters.dealsOnly) +
    Number(filters.priceMin !== undefined || filters.priceMax !== undefined);
  const headingDescription = isLoading ? "Loading products…" : isError ? "Products unavailable" :
    pageData?.complete === false && activeCount > 0 ? `${products.length} matches on this page` :
    `${serverCount} ${serverCount === 1 ? "product" : "products"} available`;
  const sortUnavailable = pageData?.complete === false;
  const filterProps = {
    categoryHandle, subcategories, selectedSubcategory: subcategoryHandle,
    brandOptions: pageData?.brandOptions ?? initialProducts?.brandOptions ?? [],
    dealCount: pageData?.dealCount ?? initialProducts?.dealCount ?? 0,
  };

  return (
    <div className={`${styles.page} min-h-screen`}>
      <HealthCareAgeGate enabled={showHealthCareAgeGate} />
      <div className={styles.container}>
        <div className={styles.resultsLayout}>
          <aside className={`${styles.filterRail} ${styles.categoryRail}`} aria-label="Product filters">
            <FilterSidebar {...filterProps} filters={filters} onFilterChange={handleFilterChange} />
          </aside>

          <main className={styles.resultsMain}>

            <div className={styles.toolbar}>
              <div className="min-w-0">
                <h1>{categoryTitle}</h1>
                <p className="mt-1 text-sm text-[var(--oweg-ink-muted)]">
                  {headingDescription}
                  {!isLoading && products.length > 0 && pageData?.complete !== false && (
                    <span className="text-gray-500">
                      {" "}
                      · Showing {pageOffset + 1}–{pageOffset + products.length}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <button type="button" onClick={() => setDraftFilters(filters)}
                  className={`${styles.filterButton} ${styles.categoryFilterButton}`}
                  aria-haspopup="dialog" aria-expanded={draftFilters !== null}>
                  <SlidersHorizontal size={16} aria-hidden="true" /> Filters{activeCount > 0 ? ` (${activeCount})` : ""}
                </button>
                <ProductSortSelect value={sortUnavailable ? "default" : sort}
                  onChange={changeSort} defaultLabel="Newest arrivals" priceSortAvailable={!sortUnavailable} />
              </div>
            </div>
            {sortUnavailable && <p className="mb-4 text-sm text-[#52664d]">
              Price sorting is available in smaller subcategories.
              {sort !== "default" && <> Showing newest arrivals. <button type="button" className="underline" onClick={() => changeSort("default")}>Reset sort</button></>}
            </p>}

            {!selectedSubcategory && (
              <CategoryHeader categoryHandle={categoryHandle} subcategories={subcategories} />
            )}
            <div className={styles.chips}>
              {filters.brands.map((brand) => <button key={brand} type="button" className={styles.chip} onClick={() => handleFilterChange({ brands: filters.brands.filter((value) => value !== brand) })} aria-label={`Remove ${brand} filter`}>{filterProps.brandOptions.find(label => label.toLowerCase() === brand) ?? brand}<X size={12} aria-hidden="true" /></button>)}
              {(filters.priceMin !== undefined || filters.priceMax !== undefined) && <button type="button" className={styles.chip} onClick={() => handleFilterChange({ priceMin: undefined, priceMax: undefined })} aria-label="Remove price filter">₹{filters.priceMin ?? 0} – {filters.priceMax === undefined ? 'Any' : `₹${filters.priceMax}`}<X size={12} aria-hidden="true" /></button>}
              {filters.dealsOnly && <button type="button" className={styles.chip} onClick={() => handleFilterChange({ dealsOnly: false })}>Today&apos;s deals<X size={12} aria-hidden="true" /></button>}
            </div>

            {isError && <p role="alert" className="py-4">Products couldn’t load. <button type="button" className="underline" onClick={() => void refetch()}>Try again</button></p>}
            <ProductGrid
              className={styles.productGrid}
              products={enrichedProducts}
              isLoading={isLoading}
              showEmpty={!isError && !isLoading && products.length === 0}
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

      {draftFilters && <CategoryFilterDialog {...filterProps} filters={draftFilters}
        onFilterChange={partial => setDraftFilters(previous => previous && { ...previous, ...partial })}
        onClose={() => setDraftFilters(null)}
        onApply={next => {
          handleFilterChange(next);
          setDraftFilters(null);
        }} />}
    </div>
  );
}

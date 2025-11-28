// CategoryPageClient: Client-side category page with filters and product grid

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
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

function extractBrandFromName(name: string) {
  if (!name) return undefined;
  const normalized = name.trim();
  if (!normalized) return undefined;
  // Take first one or two tokens depending on uppercase pattern
  const tokens = normalized.split(/\s+/);
  if (tokens.length === 0) return undefined;
  const first = tokens[0]?.replace(/[^A-Za-z0-9&]/g, "");
  if (!first || first.length < 2) return undefined;

  // If the second token is uppercase (likely part of brand), include it
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
    ? "Loading products..."
    : `${filteredProducts.length} products available`;


  return (
    <div className="bg-white min-h-screen">
      {/* Desktop Layout */}
      <div className="hidden lg:block bg-gray-50 min-h-screen">
        <div className="container mx-auto px-4 py-6">
          <div className="flex gap-6">
            {/* Left Sidebar - Filters */}
            <aside className="flex-shrink-0">
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
                products={enrichedProducts}
                isLoading={isLoading}
                showEmpty={!isLoading && filteredProducts.length === 0}
              />
            </main>
          </div>
        </div>
      </div>

      {/* Mobile Layout - Sidebar + Grid */}
      <div className="lg:hidden">
        {!selectedSubcategory && subcategories.length > 0 ? (
          <div className="flex h-[calc(100vh-180px)]">
            {/* Left Sidebar - Category Icons */}
            <aside className="w-20 flex-shrink-0 bg-[#7AC943] overflow-y-auto border-r border-[#66b735]">
              <div className="py-2 space-y-2">
                {subcategories.map((subcat) => {
                  const subcatHandle = subcat.handle || subcat.id;
                  const subcatHref = `/c/${categoryHandle}/${subcatHandle}`;
                  const metadata = (subcat.metadata || {}) as Record<string, unknown>;
                  const imageUrl =
                    (metadata?.image as string) ||
                    (metadata?.icon as string) ||
                    "/oweg_logo.png";

                  return (
                    <Link
                      key={subcat.id}
                      href={subcatHref}
                      className="flex flex-col items-center gap-1.5 px-2 py-3 group"
                    >
                      <div className="relative w-14 h-14 rounded-full bg-white shadow-[inset_0_2px_6px_rgba(0,0,0,0.18)] ring-1 ring-[#66b735]/40 border border-white overflow-hidden transition-all duration-300 flex items-center justify-center group-hover:shadow-[inset_0_3px_8px_rgba(0,0,0,0.22)]">
                        <div
                          className="relative w-10 h-10 rounded-full overflow-hidden bg-transparent shadow-[inset_0_0_12px_rgba(0,0,0,0.15)]"
                          style={{
                            WebkitMaskImage:
                              "radial-gradient(circle at center, #000 72%, transparent 100%)",
                            maskImage:
                              "radial-gradient(circle at center, #000 72%, transparent 100%)",
                          }}
                        >
                          <Image
                            src={imageUrl}
                            alt={subcat.title || subcat.name || "Category"}
                            fill
                            className="object-contain mix-blend-multiply"
                            sizes="40px"
                          />
                        </div>
                      </div>
                      <span className="text-[10px] font-medium text-white text-center leading-tight line-clamp-2 px-1">
                        {subcat.title || subcat.name || "Category"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </aside>

            {/* Right Main Area - Category Cards Grid */}
            <main className="flex-1 overflow-y-auto bg-white">
              <div className="p-3">
                <div className="grid grid-cols-2 gap-3">
                  {subcategories.map((subcat) => {
                    const subcatHandle = subcat.handle || subcat.id;
                    const subcatHref = `/c/${categoryHandle}/${subcatHandle}`;
                    const metadata = (subcat.metadata || {}) as Record<string, unknown>;
                    const imageUrl =
                      (metadata?.image as string) ||
                      (metadata?.icon as string) ||
                      "/oweg_logo.png";

                    return (
                      <Link
                        key={subcat.id}
                        href={subcatHref}
                        className="group bg-white border border-[#7AC943] rounded-lg overflow-hidden hover:shadow-md transition-all"
                      >
                        <div className="relative aspect-square bg-gray-50 overflow-hidden">
                          <Image
                            src={imageUrl}
                            alt={subcat.title || subcat.name || "Category"}
                            fill
                            className="object-contain p-3"
                            sizes="(max-width: 768px) 50vw, 33vw"
                          />
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-semibold text-gray-800 text-center line-clamp-2 group-hover:text-[#7AC943] transition-colors">
                            {subcat.title || subcat.name || "Category"}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </main>
          </div>
        ) : (
          <div className="px-4 py-4">
            {/* Page Title */}
            <div className="mb-4">
              <h1 className="text-lg font-semibold text-gray-900">{categoryTitle}</h1>
              <p className="text-gray-600 mt-1 text-sm">
                {headingDescription}
              </p>
            </div>

            {/* Product Grid */}
            <ProductGrid
              products={enrichedProducts}
              isLoading={isLoading}
              showEmpty={!isLoading && filteredProducts.length === 0}
            />
          </div>
        )}
      </div>
    </div>
  );
}


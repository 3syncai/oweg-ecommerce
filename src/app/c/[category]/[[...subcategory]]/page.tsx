// Category Page: Main category listing with filters and subcategory navigation

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPageClient } from "./CategoryPageClient";
import { findCategoryByTitleOrHandle } from "@/lib/medusa";
import type { FilterState } from "@/components/modules/FilterSidebar";
import type { UIProduct } from "@/services/medusa";

export const revalidate = 120;

type PageProps = {
  params: Promise<{
    category: string;
    subcategory?: string[];
  }>;
  searchParams?: Promise<{
    price_min?: string;
    price_max?: string;
    deals?: string;
  }>;
};

const safeDecode = (value?: string) => {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, subcategory } = await params;
  const decodedCategory = safeDecode(category) || "";
  const decodedSubcat = safeDecode(subcategory?.[0]);
  const categoryTitle = decodedCategory.replace(/-/g, " ");
  const subcatTitle = decodedSubcat?.replace(/-/g, " ");

  const title = subcatTitle
    ? `${subcatTitle} - ${categoryTitle}`
    : categoryTitle;

  return {
    title: `${title} | OWEG`,
    description: `Shop ${title} at OWEG. Best prices and quality products.`,
  };
}

function parseInitialFilters(input?: Awaited<PageProps["searchParams"]>): Partial<FilterState> {
  const priceMin = input?.price_min ? Number(input.price_min) : undefined;
  const priceMax = input?.price_max ? Number(input.price_max) : undefined;
  return {
    priceMin: Number.isFinite(priceMin) ? priceMin : undefined,
    priceMax: Number.isFinite(priceMax) ? priceMax : undefined,
    dealsOnly: input?.deals === "1",
  };
}

function resolveAppUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function fetchInitialProducts(categoryId: string, filters: Partial<FilterState>): Promise<UIProduct[]> {
  if (!categoryId) return [];
  const params = new URLSearchParams({ categoryId, limit: "48" });
  if (filters.priceMin !== undefined) params.set("priceMin", String(filters.priceMin));
  if (filters.priceMax !== undefined) params.set("priceMax", String(filters.priceMax));
  if (filters.dealsOnly) params.set("dealsOnly", "1");

  const res = await fetch(`${resolveAppUrl()}/api/medusa/products?${params.toString()}`, {
    // cache on the server and revalidate every 2 minutes
    next: { revalidate },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.products) ? (data.products as UIProduct[]) : [];
}

async function fetchInitialDeals(categoryId: string | undefined) {
  if (!categoryId) {
    return { deals: [], total: 0 };
  }
  try {
    const params = new URLSearchParams({ categoryId, limit: "6" });
    const res = await fetch(`${resolveAppUrl()}/api/medusa/deal-of-the-day?${params.toString()}`, {
      next: { revalidate },
    });
    if (!res.ok) return { deals: [], total: 0 };
    const data = await res.json();
    return {
      deals: Array.isArray(data?.products) ? data.products : [],
      total: typeof data?.total === "number" ? data.total : 0,
    };
  } catch {
    return { deals: [], total: 0 };
  }
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const [{ category: categoryParam, subcategory: subcategoryParam }, initialSearch] = await Promise.all([
    params,
    searchParams,
  ]);
  const decodedCategoryParam = safeDecode(categoryParam) || categoryParam;

  // Find the main category (server-side)
  const category = await findCategoryByTitleOrHandle(decodedCategoryParam);

  if (!category) {
    notFound();
  }

  // Get subcategories for the main category
  const subcategories = category.category_children || [];

  // If a subcategory is selected, find it (allow nested categories via handle lookup)
  let selectedSubcategory = undefined;
  if (subcategoryParam && subcategoryParam.length > 0) {
    const subcatHandle = safeDecode(subcategoryParam[0]) || subcategoryParam[0];
    selectedSubcategory =
      subcategories.find(
        (sub) => sub.handle === subcatHandle || sub.id === subcatHandle
      ) || (await findCategoryByTitleOrHandle(subcatHandle));

    if (!selectedSubcategory) {
      notFound();
    }
  }

  const initialFilters = parseInitialFilters(initialSearch);
  const [initialProducts, initialDealData] = await Promise.all([
    fetchInitialProducts(selectedSubcategory?.id || category.id, initialFilters),
    fetchInitialDeals(selectedSubcategory?.id || category.id),
  ]);

  return (
    <CategoryPageClient
      category={category}
      subcategories={subcategories}
      selectedSubcategory={selectedSubcategory}
      categoryHandle={categoryParam}
      subcategoryHandle={subcategoryParam?.[0]}
      initialProducts={initialProducts}
      initialFilters={initialFilters}
      initialDealPreview={initialDealData.deals}
      initialDealCount={initialDealData.total}
    />
  );
}


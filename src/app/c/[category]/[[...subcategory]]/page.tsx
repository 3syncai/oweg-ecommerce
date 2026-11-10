import { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPageClient } from "./CategoryPageClient";
import { findCategoryByTitleOrHandle } from "@/lib/medusa";
import { buildCategoryProductsPage } from "@/lib/category-listing";
import { parseCategoryBrands, parseCategoryPrice } from "@/lib/category-filters";
import { parseProductSort } from "@/lib/product-sort";

type PageProps = {
  params: Promise<{
    category: string;
    subcategory?: string[];
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PRODUCTS_PER_PAGE = 20;

const safeDecode = (value?: string) => {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category, subcategory } = await params;
  const decodedCategory = safeDecode(category) || "";
  const decodedSubcat = safeDecode(subcategory?.[0]);
  const categoryTitle = decodedCategory.replace(/-/g, " ");
  const subcatTitle = decodedSubcat?.replace(/-/g, " ");

  const title = subcatTitle
    ? `${subcatTitle} - ${categoryTitle}`
    : categoryTitle;

  return {
    title,
    description: `Shop ${title} at OWEG. Best prices and quality products.`,
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { category: categoryParam, subcategory: subcategoryParam } =
    await params;
  const query = await searchParams;
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
        (sub) => sub.handle === subcatHandle || sub.id === subcatHandle,
      ) || (await findCategoryByTitleOrHandle(subcatHandle));

    if (!selectedSubcategory) {
      notFound();
    }
  }

  const activeCategoryId = selectedSubcategory?.id || category.id;
  const includeSubcategories = !selectedSubcategory;
  const pageRaw = Number(firstParam(query.page) || "1");
  const requestedPage = Number.isSafeInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const dealsOnly = firstParam(query.deals) === "1";
  const pageOffset = (requestedPage - 1) * PRODUCTS_PER_PAGE;

  const initialProducts = await buildCategoryProductsPage({
    categoryId: activeCategoryId,
    includeSubcategories,
    limit: PRODUCTS_PER_PAGE,
    offset: pageOffset,
    priceMin: parseCategoryPrice(firstParam(query.price_min)),
    priceMax: parseCategoryPrice(firstParam(query.price_max)),
    sort: parseProductSort(firstParam(query.sort)),
    brands: parseCategoryBrands([query.brand ?? []].flat()),
    dealsOnly,
  }).catch(() => undefined);

  return (
    <CategoryPageClient
      category={category}
      subcategories={subcategories}
      selectedSubcategory={selectedSubcategory}
      categoryHandle={categoryParam}
      subcategoryHandle={subcategoryParam?.[0]}
      initialProducts={initialProducts}
    />
  );
}

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPageClient } from "./CategoryPageClient";
import { findCategoryByTitleOrHandle } from "@/lib/medusa";
import {
  buildCategoryDealPreview,
  buildCategoryPreviewImages,
  buildCategoryProductsPage,
} from "@/lib/category-listing";

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
    title: `${title} | OWEG`,
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
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const priceMinRaw = firstParam(query.price_min)?.trim();
  const priceMaxRaw = firstParam(query.price_max)?.trim();
  const priceMinParsed =
    priceMinRaw && priceMinRaw.length > 0 ? Number(priceMinRaw) : undefined;
  const priceMaxParsed =
    priceMaxRaw && priceMaxRaw.length > 0 ? Number(priceMaxRaw) : undefined;
  const priceMin =
    typeof priceMinParsed === "number" && Number.isFinite(priceMinParsed)
      ? priceMinParsed
      : undefined;
  const priceMax =
    typeof priceMaxParsed === "number" && Number.isFinite(priceMaxParsed)
      ? priceMaxParsed
      : undefined;
  const dealsOnly = firstParam(query.deals) === "1";
  const pageOffset = (requestedPage - 1) * PRODUCTS_PER_PAGE;

  const subcategoryIds = subcategories
    .map((sub) => sub.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const [initialProducts, initialDeals, initialCategoryPreviews] =
    await Promise.all([
      buildCategoryProductsPage({
        categoryId: activeCategoryId,
        includeSubcategories,
        limit: PRODUCTS_PER_PAGE,
        offset: pageOffset,
        priceMin:
          typeof priceMin === "number" && Number.isFinite(priceMin)
            ? priceMin
            : undefined,
        priceMax:
          typeof priceMax === "number" && Number.isFinite(priceMax)
            ? priceMax
            : undefined,
        dealsOnly,
      }).catch(() => undefined),
      buildCategoryDealPreview(activeCategoryId, includeSubcategories, 6).catch(
        () => ({ products: [], total: 0 })
      ),
      buildCategoryPreviewImages(subcategoryIds).catch(() => ({})),
    ]);

  return (
    <CategoryPageClient
      category={category}
      subcategories={subcategories}
      selectedSubcategory={selectedSubcategory}
      categoryHandle={categoryParam}
      subcategoryHandle={subcategoryParam?.[0]}
      initialProducts={initialProducts}
      initialDeals={initialDeals}
      initialCategoryPreviews={initialCategoryPreviews}
    />
  );
}

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPageClient } from "./CategoryPageClient";
import { findCategoryByTitleOrHandle } from "@/lib/medusa";

type PageProps = {
  params: Promise<{
    category: string;
    subcategory?: string[];
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

export default async function CategoryPage({ params }: PageProps) {
  const { category: categoryParam, subcategory: subcategoryParam } = await params;
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

  return (
    <CategoryPageClient
      category={category}
      subcategories={subcategories}
      selectedSubcategory={selectedSubcategory}
      categoryHandle={categoryParam}
      subcategoryHandle={subcategoryParam?.[0]}
    />
  );
}
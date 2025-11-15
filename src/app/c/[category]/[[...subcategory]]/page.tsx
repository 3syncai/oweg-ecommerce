// Category Page: Main category listing with filters and subcategory navigation

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, subcategory } = await params;
  const categoryTitle = category.replace(/-/g, " ");
  const subcatTitle = subcategory?.[0]?.replace(/-/g, " ");

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

  // Find the main category (server-side)
  const category = await findCategoryByTitleOrHandle(categoryParam);

  if (!category) {
    notFound();
  }

  // Get subcategories for the main category
  const subcategories = category.category_children || [];

  // If a subcategory is selected, find it
  let selectedSubcategory = undefined;
  if (subcategoryParam && subcategoryParam.length > 0) {
    const subcatHandle = subcategoryParam[0];
    selectedSubcategory = subcategories.find(
      (sub) => sub.handle === subcatHandle || sub.id === subcatHandle
    );

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


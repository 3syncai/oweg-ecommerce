// Medusa Service Layer: Client-side API abstraction
// This module provides typed, reusable API functions that work in both server and client

// Type definitions (imported types only, no server-side code)
export type MedusaCategory = {
  id: string;
  name?: string;
  title?: string;
  handle?: string;
  parent_category_id?: string | null;
  parent_category?: { id?: string | null } | null;
  category_children?: MedusaCategory[];
  metadata?: Record<string, unknown> | null;
};

export type MedusaProduct = {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  handle?: string;
  thumbnail?: string | null;
  images?: { url: string }[];
  categories?: Array<{ id: string; handle?: string; name?: string; title?: string }>;
  tags?: Array<{ id: string; value?: string; handle?: string }>;
  type?: { id: string; value?: string; handle?: string };
  collection?: { id?: string; title?: string; handle?: string };
  variants?: Array<{
    id: string;
    title?: string;
    inventory_quantity?: number;
    options?: Array<{ id: string; value?: string; option_id?: string }>;
    prices?: Array<{ amount: number; currency_code: string }>;
  }>;
  price?: {
    calculated_price?: number;
    original_price?: number;
  };
  metadata?: Record<string, unknown>;
};

// UI-friendly product type
export type UIProduct = {
  id: string | number;
  name: string;
  image: string;
  price: number;
  mrp: number;
  discount: number;
  limitedDeal?: boolean;
  variant_id?: string;
  handle?: string;
  opencartId?: string | number;
};

export type CategoryProductQueryParams = {
  limit?: number;
  priceMin?: number;
  priceMax?: number;
  dealsOnly?: boolean;
};

/**
 * Fetch all categories from Medusa backend via API route
 */
export async function getCategoriesService(): Promise<MedusaCategory[]> {
  const response = await fetch("/api/medusa/categories", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.status}`);
  }

  const data = await response.json();
  return data.categories || [];
}

/**
 * Find a category by its handle or title via API route
 */
export async function getCategoryByHandle(
  handle: string
): Promise<MedusaCategory | undefined> {
  const response = await fetch(
    `/api/medusa/categories?handle=${encodeURIComponent(handle)}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    return undefined;
  }

  const data = await response.json();
  return data.category;
}

/**
 * Fetch products for a category with price overrides from MySQL
 */
export async function getProductsByCategoryService(
  categoryId: string,
  params?: CategoryProductQueryParams
): Promise<UIProduct[]> {
  const search = new URLSearchParams({
    categoryId,
    limit: String(params?.limit ?? 50),
  });

  if (params?.priceMin !== undefined) {
    search.set("priceMin", String(params.priceMin));
  }
  if (params?.priceMax !== undefined) {
    search.set("priceMax", String(params.priceMax));
  }
  if (params?.dealsOnly) {
    search.set("dealsOnly", "1");
  }

  const response = await fetch(`/api/medusa/products?${search.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.status}`);
  }

  const data = await response.json();
  return data.products || [];
}

/**
 * Get subcategories for a parent category
 */
export function getSubcategories(
  parentCategory: MedusaCategory
): MedusaCategory[] {
  return parentCategory.category_children || [];
}

/**
 * Build category hierarchy for navigation
 */
export function buildCategoryTree(
  categories: MedusaCategory[]
): MedusaCategory[] {
  const categoryMap = new Map<string, MedusaCategory>();
  const rootCategories: MedusaCategory[] = [];

  // First pass: create map
  categories.forEach((cat) => {
    if (cat?.id) {
      categoryMap.set(cat.id, { ...cat, category_children: [] });
    }
  });

  // Second pass: build tree
  categories.forEach((cat) => {
    if (!cat?.id) return;
    
    const parentId =
      cat.parent_category_id ||
      cat.parent_category?.id ||
      null;

    if (!parentId) {
      rootCategories.push(categoryMap.get(cat.id)!);
    } else if (categoryMap.has(parentId)) {
      const parent = categoryMap.get(parentId)!;
      if (!parent.category_children) {
        parent.category_children = [];
      }
      parent.category_children.push(categoryMap.get(cat.id)!);
    }
  });

  return rootCategories;
}


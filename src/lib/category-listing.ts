import {
  fetchProductsByCategoryId,
  isMedusaProductInStock,
  toUiProduct,
  type MedusaProduct,
} from "@/lib/medusa";
import { getPriceListPrices } from "@/lib/price-lists";
import {
  MEDUSA_LIST_MAX_LIMIT,
  overfetchLimit,
  sliceFilteredPage,
} from "@/lib/paginated-in-stock";
import type { CategoryProductsPage } from "@/services/medusa";

const PRODUCTS_PER_PAGE = 20;

export type CategoryDealPreview = {
  id: string | number;
  name: string;
  image: string;
  price: number;
  mrp: number;
  discount: number;
  limitedDeal?: boolean;
};

export type CategoryPreviewMap = Record<
  string,
  { image: string; productId: string }
>;

export async function buildCategoryProductsPage(options: {
  categoryId: string;
  includeSubcategories: boolean;
  limit?: number;
  offset?: number;
  priceMin?: number;
  priceMax?: number;
  dealsOnly?: boolean;
}): Promise<CategoryProductsPage> {
  const limit = options.limit ?? PRODUCTS_PER_PAGE;
  const offset = options.offset ?? 0;
  const fetchLimit = overfetchLimit(limit, MEDUSA_LIST_MAX_LIMIT);

  const listResult = await fetchProductsByCategoryId(options.categoryId, fetchLimit, {
    includeSubcategories: options.includeSubcategories,
    offset,
  });

  const products = listResult.products;
  const medusaCount = listResult.count;
  const priceListPrices = await getPriceListPrices();
  const inStockProducts = products.filter(isMedusaProductInStock);

  let ui = inStockProducts.map((product: MedusaProduct) => {
    const variantId = product.variants?.[0]?.id;
    if (variantId && priceListPrices.has(variantId) && product.variants?.[0]) {
      const discountedPrice = priceListPrices.get(variantId)!;
      const originalPrice =
        product.price?.original_price ||
        product.variants[0].prices?.[0]?.amount ||
        discountedPrice;
      return toUiProduct({
        ...product,
        price: {
          calculated_price: discountedPrice,
          original_price: originalPrice,
        },
      });
    }
    return toUiProduct(product);
  });

  if (typeof options.priceMin === "number" && Number.isFinite(options.priceMin)) {
    ui = ui.filter((product) => product.price >= options.priceMin!);
  }
  if (typeof options.priceMax === "number" && Number.isFinite(options.priceMax)) {
    ui = ui.filter((product) => product.price <= options.priceMax!);
  }
  if (options.dealsOnly) {
    ui = ui.filter((product) => product.limitedDeal);
  }

  const page = sliceFilteredPage({
    filtered: ui,
    fetchedCount: products.length,
    pageLimit: limit,
    offset,
    fetchLimit,
    upstreamCount: medusaCount,
  });

  return {
    products: page.products,
    count: page.count,
    limit,
    offset,
    hasMore: page.hasMore,
  };
}

export async function buildCategoryDealPreview(
  categoryId: string,
  includeSubcategories: boolean,
  limit = 6
): Promise<{ products: CategoryDealPreview[]; total: number }> {
  const page = await buildCategoryProductsPage({
    categoryId,
    includeSubcategories,
    limit,
    offset: 0,
    dealsOnly: true,
  });
  return {
    products: page.products as CategoryDealPreview[],
    total: page.products.length,
  };
}

export async function buildCategoryPreviewImages(
  categoryIds: string[]
): Promise<CategoryPreviewMap> {
  const unique = Array.from(new Set(categoryIds.filter(Boolean)));
  const previews: CategoryPreviewMap = {};

  await Promise.all(
    unique.map(async (categoryId) => {
      try {
        const result = await fetchProductsByCategoryId(categoryId, 1, {
          includeSubcategories: true,
        });
        const product = result.products[0];
        if (!product) return;
        previews[categoryId] = {
          image: product.thumbnail || product.images?.[0]?.url || "/oweg_logo.png",
          productId: product.id,
        };
      } catch (error) {
        console.warn("Failed to build preview for category", categoryId, error);
      }
    })
  );

  return previews;
}

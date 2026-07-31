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

function applyPriceList(
  products: MedusaProduct[],
  priceListPrices: Map<string, number>
) {
  return products.map((product: MedusaProduct) => {
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
}

function applyClientFilters(
  ui: ReturnType<typeof toUiProduct>[],
  options: {
    priceMin?: number;
    priceMax?: number;
    dealsOnly?: boolean;
  }
) {
  let next = ui;
  if (typeof options.priceMin === "number" && Number.isFinite(options.priceMin)) {
    next = next.filter((product) => product.price >= options.priceMin!);
  }
  if (typeof options.priceMax === "number" && Number.isFinite(options.priceMax)) {
    next = next.filter((product) => product.price <= options.priceMax!);
  }
  if (options.dealsOnly) {
    next = next.filter((product) => product.limitedDeal);
  }
  return next;
}

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
  const hasClientFilters =
    (typeof options.priceMin === "number" && Number.isFinite(options.priceMin)) ||
    (typeof options.priceMax === "number" && Number.isFinite(options.priceMax)) ||
    Boolean(options.dealsOnly);

  const priceListPrices = await getPriceListPrices();

  // When price/deal filters are active, fetch a stable window from offset 0,
  // filter, then slice — avoids duplicate/skip across pages.
  if (hasClientFilters) {
    const listResult = await fetchProductsByCategoryId(
      options.categoryId,
      MEDUSA_LIST_MAX_LIMIT,
      {
        includeSubcategories: options.includeSubcategories,
        offset: 0,
      }
    );
    const inStockProducts = (listResult.products || []).filter(isMedusaProductInStock);
    const filtered = applyClientFilters(
      applyPriceList(inStockProducts, priceListPrices),
      options
    );
    const pageProducts = filtered.slice(offset, offset + limit);
    return {
      products: pageProducts,
      count: filtered.length,
      limit,
      offset,
      hasMore: offset + limit < filtered.length,
      appliedPriceMin: options.priceMin,
      appliedPriceMax: options.priceMax,
      appliedDealsOnly: Boolean(options.dealsOnly),
    };
  }

  const fetchLimit = overfetchLimit(limit, MEDUSA_LIST_MAX_LIMIT);
  const listResult = await fetchProductsByCategoryId(options.categoryId, fetchLimit, {
    includeSubcategories: options.includeSubcategories,
    offset,
  });

  const products = listResult.products;
  const medusaCount = listResult.count;
  const inStockProducts = products.filter(isMedusaProductInStock);
  const ui = applyClientFilters(
    applyPriceList(inStockProducts, priceListPrices),
    options
  );

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
    appliedPriceMin: options.priceMin,
    appliedPriceMax: options.priceMax,
    appliedDealsOnly: Boolean(options.dealsOnly),
  };
}

export async function buildCategoryDealPreview(
  categoryId: string,
  includeSubcategories: boolean,
  limit = 6
): Promise<{ products: CategoryDealPreview[]; total: number; categoryId: string }> {
  const page = await buildCategoryProductsPage({
    categoryId,
    includeSubcategories,
    limit: MEDUSA_LIST_MAX_LIMIT,
    offset: 0,
    dealsOnly: true,
  });
  return {
    products: page.products.slice(0, limit) as CategoryDealPreview[],
    total: page.count,
    categoryId,
  };
}

export async function buildCategoryPreviewImages(
  categoryIds: string[]
): Promise<CategoryPreviewMap> {
  const unique = Array.from(new Set(categoryIds.filter(Boolean))).slice(0, 24);
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

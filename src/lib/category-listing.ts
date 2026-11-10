import { fetchCatalogCategoryProducts } from "@/lib/catalogue-read-cache";
import {
  fetchProductsByCategoryId,
  applySpecialPricesToProduct,
  isMedusaProductInStock,
  toUiProduct,
  type MedusaProduct,
} from "@/lib/medusa";
import { getPriceListPrices } from "@/lib/price-lists";
import { groupCatalogProductCards } from "@/lib/catalog-product-group";
import {
  MEDUSA_LIST_MAX_LIMIT,
  overfetchLimit,
  sliceFilteredPage,
} from "@/lib/paginated-in-stock";
import type { CategoryProductsPage } from "@/services/medusa";
import { sortProductsByPrice, type ProductSort } from "@/lib/product-sort";

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
  return products.map((product: MedusaProduct) =>
    toUiProduct(applySpecialPricesToProduct(product, priceListPrices)));
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
  sort?: ProductSort;
  brands?: string[];
}): Promise<CategoryProductsPage> {
  const limit = options.limit ?? PRODUCTS_PER_PAGE;
  const offset = options.offset ?? 0;
  const hasClientFilters =
    (typeof options.priceMin === "number" && Number.isFinite(options.priceMin)) ||
    (typeof options.priceMax === "number" && Number.isFinite(options.priceMax)) ||
    Boolean(options.dealsOnly);

  const fetchLimit = overfetchLimit(limit, MEDUSA_LIST_MAX_LIMIT);
  const [priceListPrices, listResult] = await Promise.all([
    getPriceListPrices(),
    fetchCatalogCategoryProducts(options.categoryId, {
      includeSubcategories: options.includeSubcategories,
      offset: hasClientFilters ? 0 : offset,
      fallbackLimit: hasClientFilters ? MEDUSA_LIST_MAX_LIMIT : fetchLimit,
    }),
  ]);
  const cards = groupCatalogProductCards(applyPriceList(
    listResult.products.filter(isMedusaProductInStock), priceListPrices,
  ));
  const brandFor = (card: (typeof cards)[number]) => card.brand?.trim() ||
    card.name.trim().split(/\s+/, 1)[0]?.replace(/[^A-Za-z0-9&]/g, "") || "";
  const brands = new Map<string, string>();
  cards.forEach(card => {
    const label = brandFor(card);
    if (label.length >= 2 && label.length <= 80) brands.set(label.toLowerCase(), label);
  });
  const selected = new Set(options.brands);
  const matchesBrand = (card: (typeof cards)[number]) =>
    selected.size === 0 || selected.has(brandFor(card).toLowerCase());
  const ui = applyClientFilters(cards, options);
  const appliedSort = options.sort ?? "default";
  const responseFields = {
    limit, offset,
    complete: listResult.complete,
    appliedPriceMin: options.priceMin,
    appliedPriceMax: options.priceMax,
    appliedDealsOnly: Boolean(options.dealsOnly),
    appliedSort,
    appliedBrands: options.brands ?? [],
    brandOptions: [...brands.values()].sort((a, b) => a.localeCompare(b)),
    dealCount: listResult.complete ? cards.filter(card => card.limitedDeal).length : undefined,
  };

  if (listResult.complete) {
    const matching = sortProductsByPrice(ui.filter(matchesBrand), appliedSort);
    return {
      ...responseFields,
      products: matching.slice(offset, offset + limit),
      count: matching.length,
      hasMore: offset + limit < matching.length,
    };
  }

  // Keep the existing bounded listing for large categories. Sorting only this
  // window would give the wrong ordering across pages.
  if (hasClientFilters) return {
    ...responseFields,
    products: ui.slice(offset, offset + limit).filter(matchesBrand),
    count: listResult.count,
    hasMore: offset + limit < listResult.count,
  };

  const page = sliceFilteredPage({
    filtered: ui,
    fetchedCount: listResult.products.length,
    pageLimit: limit,
    offset,
    fetchLimit,
    upstreamCount: listResult.count,
  });

  return {
    ...responseFields,
    products: page.products.filter(matchesBrand),
    count: page.count,
    hasMore: page.hasMore,
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

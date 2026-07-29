import {
  fetchCategories,
  fetchProductsByCategoryId,
  isMedusaProductInStock,
  toUiProduct,
  type MedusaCategory,
  type MedusaProduct,
} from "@/lib/medusa";

export type HomeFeedUiProduct = ReturnType<typeof toUiProduct> & {
  score?: number;
};

export type HomeFeedSection = {
  key: string;
  title: string;
  handle?: string;
  href?: string;
  products: HomeFeedUiProduct[];
  sourceTag: string;
};

export type HomeFeedResult = {
  sections: HomeFeedSection[];
  spotlight: HomeFeedSection | null;
  popular: HomeFeedSection | null;
  meta: {
    categoriesTried: number;
    categoriesWithProducts: number;
    totalProducts: number;
  };
};

const MAX_SECTIONS = 6;
const MAX_PER_SECTION = 12;
const PER_CATEGORY_FETCH = 24;
const MAX_CATEGORIES_TO_PROBE = 16;

function humanizeHandle(handle?: string | null) {
  if (!handle) return "Products";
  return handle
    .replace(/&/g, " and ")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function categoryTitle(cat: MedusaCategory) {
  const title = (cat.title || cat.name || "").trim();
  return title || humanizeHandle(cat.handle);
}

function isRootCategory(cat: MedusaCategory) {
  const parentId =
    (cat as MedusaCategory & { parent_category_id?: string | null }).parent_category_id ??
    (cat as MedusaCategory & { parent_category?: { id?: string | null } }).parent_category?.id;
  return !parentId;
}

function rankProduct(product: MedusaProduct, index: number) {
  const ui = toUiProduct(product);
  const inStock = isMedusaProductInStock(product) ? 1000 : 0;
  const discount = typeof ui.discount === "number" ? ui.discount : 0;
  const hasRealImage = ui.image && ui.image !== "/oweg_logo.png" ? 80 : 0;
  const pricePenalty = ui.price > 0 ? Math.min(40, Math.floor(ui.price / 5000)) : 0;
  const recency = Math.max(0, PER_CATEGORY_FETCH - index);
  return inStock + discount * 2 + hasRealImage + recency - pricePenalty;
}

function sortAndSlice(products: MedusaProduct[], limit = MAX_PER_SECTION): HomeFeedUiProduct[] {
  return products
    .map((product, index) => {
      const score = rankProduct(product, index);
      return { ...toUiProduct(product), score };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

export async function buildHomeFeed(): Promise<HomeFeedResult> {
  const categories = await fetchCategories({ revalidate: 120 });
  const roots = categories
    .filter(isRootCategory)
    .sort((a, b) => {
      const rankA = typeof a.rank === "number" ? a.rank : 9999;
      const rankB = typeof b.rank === "number" ? b.rank : 9999;
      if (rankA !== rankB) return rankA - rankB;
      return categoryTitle(a).localeCompare(categoryTitle(b));
    })
    .slice(0, MAX_CATEGORIES_TO_PROBE);

  const settled = await Promise.all(
    roots.map(async (cat) => {
      if (!cat.id) return null;
      try {
        const list = await fetchProductsByCategoryId(cat.id, PER_CATEGORY_FETCH, {
          includeSubcategories: true,
        });
        const products = Array.isArray(list.products) ? list.products : [];
        if (!products.length) return null;
        const ranked = sortAndSlice(products, MAX_PER_SECTION);
        if (!ranked.length) return null;
        const handle = cat.handle || undefined;
        const title = categoryTitle(cat);
        return {
          key: handle || cat.id,
          title,
          handle,
          href: handle ? `/c/${encodeURIComponent(handle)}` : undefined,
          products: ranked,
          sourceTag: `category:${handle || cat.id}`,
          stockCount: ranked.filter((p) => (p.inventory_quantity ?? 0) > 0).length,
        };
      } catch {
        return null;
      }
    })
  );

  const filled = settled
    .filter((section): section is NonNullable<typeof section> => Boolean(section))
    .sort((a, b) => {
      if (b.stockCount !== a.stockCount) return b.stockCount - a.stockCount;
      return b.products.length - a.products.length;
    });

  const sections = filled.slice(0, MAX_SECTIONS).map(({ stockCount: _s, ...section }) => section);
  const leftovers = filled.slice(MAX_SECTIONS);
  const spotlightSource =
    leftovers.find((s) => s.products.length >= 4) ||
    leftovers.sort((a, b) => b.products.length - a.products.length)[0];
  const spotlight =
    spotlightSource && spotlightSource.products.length >= 4
      ? (({ stockCount: _s, ...section }) => section)(spotlightSource)
      : null;

  const seen = new Set<string>();
  const popularPool: HomeFeedUiProduct[] = [];
  for (const section of filled) {
    for (const product of section.products) {
      const id = String(product.id);
      if (seen.has(id)) continue;
      seen.add(id);
      popularPool.push(product);
    }
  }
  popularPool.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const popular =
    popularPool.length > 0
      ? {
          key: "popular-picks",
          title: "Popular picks",
          products: popularPool.slice(0, MAX_PER_SECTION),
          sourceTag: "home:popular",
        }
      : null;

  return {
    sections,
    spotlight,
    popular,
    meta: {
      categoriesTried: roots.length,
      categoriesWithProducts: filled.length,
      totalProducts: seen.size,
    },
  };
}

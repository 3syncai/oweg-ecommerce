import { unstable_cache } from 'next/cache';
import { fetchCatalogCategoryProducts as readCategory } from './medusa';

// Public catalogue data only. Never use this cache for carts, addresses or payments.
// Keep canonical grouping input intact, so another vendor cannot reappear on page 2.
const snapshot = unstable_cache(
  (id: string, descendants: boolean) => readCategory(id, { includeSubcategories: descendants, offset: 0, fallbackLimit: 60 }),
  ['catalogue-category-snapshot-v1'], { revalidate: 60, tags: ['catalogue'] },
);
const inFlight = new Map<string, ReturnType<typeof snapshot>>();

export async function fetchCatalogCategoryProducts(id: string, options: { includeSubcategories?: boolean; offset: number; fallbackLimit: number }) {
  const key = JSON.stringify([id, Boolean(options.includeSubcategories)]);
  let pending = inFlight.get(key);
  if (!pending) {
    pending = snapshot(id, Boolean(options.includeSubcategories)).finally(() => { inFlight.delete(key); });
    inFlight.set(key, pending);
  }
  const result = await pending;
  if (result.complete) return result;
  // Preserve the existing bounded fallback for very large categories.
  if (options.offset === 0) return { ...result, products: result.products.slice(0, options.fallbackLimit) };
  return readCategory(id, options);
}

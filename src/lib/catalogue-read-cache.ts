import { unstable_cache } from 'next/cache';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';
import { fetchCatalogCategoryProducts as readCategory } from './medusa';

type CategorySnapshot = Awaited<ReturnType<typeof readCategory>>;

const compress = promisify(gzip);
const decompress = promisify(gunzip);
// Leave room for base64 expansion and Next's cache envelope under the 2 MiB limit.
const MAX_COMPRESSED_BYTES = 1024 * 1024;

// Public catalogue data only. Never use this cache for carts, addresses or payments.
// Keep canonical grouping input intact, so another vendor cannot reappear on page 2.
async function loadSnapshot(id: string, includeSubcategories: boolean): Promise<CategorySnapshot> {
  const read = () => readCategory(id, { includeSubcategories, offset: 0, fallbackLimit: 60 });
  let fresh: CategorySnapshot | undefined;
  const cached = unstable_cache(
    async (categoryId: string, descendants: boolean) => {
      fresh = await readCategory(categoryId, { includeSubcategories: descendants, offset: 0, fallbackLimit: 60 });
      const compressed = await compress(JSON.stringify(fresh));
      return compressed.length <= MAX_COMPRESSED_BYTES ? compressed.toString('base64') : null;
    },
    ['catalogue-category-snapshot-v2'], { revalidate: 60, tags: ['catalogue'] },
  );
  const encoded = await cached(id, includeSubcategories);
  if (encoded === null) return fresh ?? read();
  if (fresh) return fresh;
  return JSON.parse((await decompress(Buffer.from(encoded, 'base64'))).toString('utf8'));
}

const inFlight = new Map<string, Promise<CategorySnapshot>>();

export async function fetchCatalogCategoryProducts(id: string, options: { includeSubcategories?: boolean; offset: number; fallbackLimit: number }) {
  const key = JSON.stringify([id, Boolean(options.includeSubcategories)]);
  let pending = inFlight.get(key);
  if (!pending) {
    pending = loadSnapshot(id, Boolean(options.includeSubcategories)).finally(() => { inFlight.delete(key); });
    inFlight.set(key, pending);
  }
  const result = await pending;
  if (result.complete) return result;
  // Preserve the existing bounded fallback for very large categories.
  if (options.offset === 0) return { ...result, products: result.products.slice(0, options.fallbackLimit) };
  return readCategory(id, options);
}

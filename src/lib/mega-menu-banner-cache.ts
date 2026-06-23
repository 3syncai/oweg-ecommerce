export type MegaMenuBannerSlide = {
  id: string;
  image_url: string;
  link_url: string;
  alt_text?: string;
  open_in_new_tab?: boolean;
};

const bannerCache = new Map<string, MegaMenuBannerSlide[]>();
const inflightRequests = new Map<string, Promise<MegaMenuBannerSlide[]>>();
const preloadedImages = new Set<string>();

function normalizeHandle(handle?: string): string {
  return handle?.trim() ?? "";
}

async function fetchBannersFromApi(handle: string): Promise<MegaMenuBannerSlide[]> {
  const res = await fetch(
    `/api/medusa/mega-menu-banners?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.banners) ? (data.banners as MegaMenuBannerSlide[]) : [];
}

export function getCachedMegaMenuBanners(handle?: string): MegaMenuBannerSlide[] | undefined {
  const key = normalizeHandle(handle);
  if (!key) return undefined;
  return bannerCache.get(key);
}

export function preloadMegaMenuBannerImages(banners: MegaMenuBannerSlide[]): void {
  if (typeof window === "undefined") return;

  for (const banner of banners) {
    const url = banner.image_url?.trim();
    if (!url || preloadedImages.has(url)) continue;
    preloadedImages.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}

export async function fetchMegaMenuBannersCached(handle?: string): Promise<MegaMenuBannerSlide[]> {
  const key = normalizeHandle(handle);
  if (!key) return [];

  const cached = bannerCache.get(key);
  if (cached) {
    preloadMegaMenuBannerImages(cached);
    return cached;
  }

  let inflight = inflightRequests.get(key);
  if (!inflight) {
    inflight = fetchBannersFromApi(key)
      .then((banners) => {
        bannerCache.set(key, banners);
        preloadMegaMenuBannerImages(banners);
        return banners;
      })
      .finally(() => {
        inflightRequests.delete(key);
      });
    inflightRequests.set(key, inflight);
  }

  return inflight;
}

export function prefetchMegaMenuBanners(handle?: string): void {
  const key = normalizeHandle(handle);
  if (!key) return;

  const cached = bannerCache.get(key);
  if (cached) {
    preloadMegaMenuBannerImages(cached);
    return;
  }

  void fetchMegaMenuBannersCached(key);
}

export function prefetchMegaMenuBannersForCategories(
  categories: Array<{ handle?: string }>,
  limit = 4
): void {
  const run = () => {
    categories.slice(0, limit).forEach((category) => {
      prefetchMegaMenuBanners(category.handle);
    });
  };

  if (typeof window === "undefined") return;

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 2000 });
    return;
  }

  globalThis.setTimeout(run, 500);
}

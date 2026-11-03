import { unstable_cache } from "next/cache";
import { buildHomeFeed, type HomeFeedResult } from "./home-feed";
import { getBoundedPool } from "./bounded-pool";
import { readHomeFeedSnapshot } from "./home-feed-snapshot";

const HOME_FEED_CACHE_TTL_MS = 30_000;

type HomeFeedCacheEntry = {
  expiresAt: number;
  value: HomeFeedResult;
};

type HomeFeedGlobalCache = {
  cache: HomeFeedCacheEntry | null;
  inFlight: Promise<HomeFeedCacheEntry> | null;
};

const homeFeedGlobal: HomeFeedGlobalCache = (() => {
  const g = globalThis as typeof globalThis & {
    __owegHomeFeedCacheV2?: HomeFeedGlobalCache;
  };
  if (!g.__owegHomeFeedCacheV2) {
    g.__owegHomeFeedCacheV2 = { cache: null, inFlight: null };
  }
  return g.__owegHomeFeedCacheV2;
})();

const readSharedHomeFeed = unstable_cache(buildHomeFeed, ['home-feed-v3'], { revalidate: 60, tags: ['catalogue'] });

export async function buildHomeFeedCached(): Promise<{
  feed: HomeFeedResult;
  cacheHit: boolean;
  expiresAt: number;
}> {
  const now = Date.now();
  if (homeFeedGlobal.cache && homeFeedGlobal.cache.expiresAt > now) {
    return { feed: homeFeedGlobal.cache.value, expiresAt: homeFeedGlobal.cache.expiresAt, cacheHit: true };
  }
  if (homeFeedGlobal.inFlight) {
    const entry = await homeFeedGlobal.inFlight;
    return { feed: entry.value, expiresAt: entry.expiresAt, cacheHit: true };
  }
  homeFeedGlobal.inFlight = readFeed()
    .then(({ feed, expiresAt }) => {
      const entry = {
        value: feed,
        expiresAt: Math.min(expiresAt, Date.now() + HOME_FEED_CACHE_TTL_MS),
      };
      homeFeedGlobal.cache = entry;
      return entry;
    })
    .finally(() => {
      homeFeedGlobal.inFlight = null;
    });
  const entry = await homeFeedGlobal.inFlight;
  return { feed: entry.value, expiresAt: entry.expiresAt, cacheHit: false };
}

async function readFeed() {
  if (process.env.HOME_FEED_SNAPSHOT_ENABLED !== "true") {
    return { feed: await readSharedHomeFeed(), expiresAt: Infinity };
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Homepage snapshot database is unavailable");
  return readHomeFeedSnapshot(getBoundedPool(databaseUrl, true));
}

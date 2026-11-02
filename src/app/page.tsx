import { Suspense } from 'react';
import HomePage, { HomeShell, HomeFeedSkeleton } from './home/HomePage';
import FlashSaleSection, { FlashSaleSkeleton, type FlashSaleData } from '@/components/flash-sale/FlashSaleSection';
import { buildHomeFeedCached } from '@/lib/home-feed';
import { loadFlashSale } from '@/lib/flash-sale-server';

async function Feed({ promise }: { promise: ReturnType<typeof buildHomeFeedCached> }) {
  let feed;
  try { ({ feed } = await promise); } catch { /* Client Retry remains available. */ }
  return <HomePage initialFeed={feed} sectionsOnly />;
}
async function Deals({ promise }: { promise: ReturnType<typeof loadFlashSale> }) {
  let data;
  try { data = await promise; } catch { /* Polling client retries without blocking the feed. */ }
  return <FlashSaleSection showImageFallback inStockOnly initialData={data as FlashSaleData | undefined} />;
}
export default function Page() {
  // Start both reads now, not after the other section resolves or hydrates.
  const feed = buildHomeFeedCached();
  const deals = loadFlashSale({ homeOnly: true });
  // Attach rejection handlers immediately; each boundary handles its own failure.
  void feed.catch(() => undefined);
  void deals.catch(() => undefined);
  return <main><h1 className="sr-only">Good finds. Everyday living.</h1><HomeShell />
    <Suspense fallback={<FlashSaleSkeleton />}><Deals promise={deals} /></Suspense>
    <Suspense fallback={<HomeFeedSkeleton />}><Feed promise={feed} /></Suspense>
  </main>;
}

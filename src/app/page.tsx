import { Suspense } from 'react';
import type { Metadata } from 'next';
import styles from './home/HomePage.module.css';
import HomePage, { HomeShell, HomeFeedSkeleton } from './home/HomePage';
import FlashSaleSection, { FlashSaleSkeleton, type FlashSaleData } from '@/components/flash-sale/FlashSaleSection';
import { buildHomeFeedCached } from '@/lib/home-feed-cache';
import { loadFlashSale } from '@/lib/flash-sale-server';

const shareTitle = 'Online Shopping in India for Home, Kitchen & Electronics | OWEG';
const shareDescription = 'Shop online at OWEG for home appliances, cookware, kitchen essentials, and computer and mobile accessories. Browse brands and explore the latest deals.';
const shareImage = {
  url: '/images/social/oweg-storefront-v2.jpg',
  width: 1200,
  height: 630,
  type: 'image/jpeg',
  alt: 'Official OWEG logo on a white background.',
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.0weg.in'),
  title: { absolute: shareTitle },
  description: shareDescription,
  openGraph: {
    type: 'website',
    siteName: 'OWEG',
    title: shareTitle,
    description: shareDescription,
    images: [shareImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: shareTitle,
    description: shareDescription,
    images: [{ url: shareImage.url, alt: shareImage.alt }],
  },
};

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
  return <div className={styles.home}><h1 className="sr-only">Good finds. Everyday living.</h1><HomeShell />
    <Suspense fallback={<FlashSaleSkeleton />}><Deals promise={deals} /></Suspense>
    <Suspense fallback={<HomeFeedSkeleton />}><Feed promise={feed} /></Suspense>
  </div>;
}

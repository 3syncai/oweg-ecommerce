import { Suspense } from 'react';
import type { Metadata } from 'next';
import FeaturedProductsRow from './home/FeaturedProductsRow';
import styles from './home/HomePage.module.css';
import HomePage, { HomeShell, HomeFeedSkeleton } from './home/HomePage';
import FlashSaleSection, { FlashSaleSkeleton, type FlashSaleData } from '@/components/flash-sale/FlashSaleSection';
import { buildHomeFeedCached } from '@/lib/home-feed-cache';
import { loadFeaturedProducts } from '@/lib/featured-products-server';
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
async function FeaturedProducts({ promise }: { promise: ReturnType<typeof loadFeaturedProducts> }) {
  const row = await promise;
  return row && <FeaturedProductsRow title={row.title} products={row.products} nextCursor={row.nextCursor} />;
}

export default function Page() {
  // Start independent reads before their streaming boundaries render.
  const feed = buildHomeFeedCached();
  const deals = loadFlashSale({ homeOnly: true });
  const featured = loadFeaturedProducts();
  // Attach rejection handlers immediately; each boundary handles its own failure.
  void feed.catch(() => undefined);
  void deals.catch(() => undefined);
  return (
    <div className={styles.home}>
      <h1 className="sr-only">Good finds. Everyday living.</h1>
      <HomeShell />
      <Suspense fallback={<FlashSaleSkeleton />}>
        <Deals promise={deals} />
      </Suspense>
      <Suspense fallback={null}>
        <FeaturedProducts promise={featured} />
      </Suspense>
      <Suspense fallback={<HomeFeedSkeleton />}>
        <Feed promise={feed} />
      </Suspense>
    </div>
  );
}

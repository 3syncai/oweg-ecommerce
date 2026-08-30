'use client';

import React, { Suspense } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { ProductCard } from '@/components/modules/ProductCard';

type UIProduct = {
  id: string | number;
  name: string;
  image: string;
  price: number;
  mrp: number;
  discount: number;
  limitedDeal?: boolean;
  variant_id?: string;
  handle?: string;
  sourceTag?: string;
  inventory_quantity?: number;
};

const SPECIALS_PAGE_SIZE = 24;

async function fetchSpecialsPage(page: number): Promise<{
  products: UIProduct[];
  count: number;
}> {
  const offset = (page - 1) * SPECIALS_PAGE_SIZE;
  const res = await fetch(
    `/api/medusa/products?tag=Specials&limit=${SPECIALS_PAGE_SIZE}&offset=${offset}`,
    { cache: 'no-store' }
  );
  if (!res.ok) {
    throw new Error('Unable to load Specials');
  }
  const data = await res.json();
  return {
    products: (data?.products || []) as UIProduct[],
    count: typeof data?.count === 'number' ? data.count : (data?.products || []).length,
  };
}

function SpecialsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const specialsQuery = useQuery({
    queryKey: ['specials-page', requestedPage],
    queryFn: () => fetchSpecialsPage(requestedPage),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });

  const products = specialsQuery.data?.products ?? [];
  const count = specialsQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / SPECIALS_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const loading = specialsQuery.isLoading && !specialsQuery.isPlaceholderData;
  const hasError = specialsQuery.error;

  const goToPage = (page: number) => {
    const safe = Math.max(1, Math.min(page, totalPages));
    const next = new URLSearchParams(searchParams.toString());
    if (safe <= 1) next.delete('page');
    else next.set('page', String(safe));
    const qs = next.toString();
    router.replace(qs ? `/specials?${qs}` : '/specials', { scroll: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="oweg-page min-h-screen pb-10">
      <div className="oweg-container space-y-6 py-8 md:py-10">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--oweg-surface-tint)] px-4 py-1 text-xs font-semibold text-[var(--oweg-green-dark)]">
            Specials
          </div>
          <h1 className="oweg-title text-[clamp(1.6rem,1.1rem+2.4vw,2.5rem)]">Specials tagged products</h1>
          <p className="oweg-subtle">
            Explore every product marked with the Specials tag across the store.
            {!loading && count > 0 ? ` · ${count} products` : ''}
          </p>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 text-emerald-700 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading Specials…
          </div>
        ) : hasError ? (
          <div className="text-sm text-red-500">Unable to load Specials right now. Please try again.</div>
        ) : products.length === 0 ? (
          <div className="text-sm text-gray-600">No Specials products available right now.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {[...products]
                .sort((a, b) => {
                  const aInStock = typeof a.inventory_quantity === 'number' && a.inventory_quantity > 0;
                  const bInStock = typeof b.inventory_quantity === 'number' && b.inventory_quantity > 0;
                  if (aInStock && !bInStock) return -1;
                  if (!aInStock && bInStock) return 1;
                  return 0;
                })
                .map((product) => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name}
                    image={product.image}
                    price={product.price}
                    mrp={product.mrp}
                    discount={product.discount}
                    limitedDeal={product.limitedDeal}
                    variant_id={product.variant_id}
                    handle={product.handle}
                    sourceTag="Specials"
                    inventory_quantity={product.inventory_quantity}
                  />
                ))}
            </div>
            {totalPages > 1 ? (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </button>
                <span className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function SpecialsPage() {
  return (
    <Suspense
      fallback={
        <div className="oweg-page flex min-h-screen items-center justify-center gap-2 text-sm text-[var(--oweg-green-dark)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading Specials…
        </div>
      }
    >
      <SpecialsPageContent />
    </Suspense>
  );
}

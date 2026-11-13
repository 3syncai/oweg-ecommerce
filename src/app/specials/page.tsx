'use client';

import BrandLoader from "@/components/ui/BrandLoader";
import React, { Suspense } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
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
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };

  return (
    <div className="oweg-page min-h-screen pb-10">
      <div className="oweg-container space-y-5 py-5 sm:space-y-7 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#173f34] p-5 text-white sm:p-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">OWEG Specials</h1>
            <p className="mt-2 text-sm text-[#dcebdc] sm:text-base">Explore our current selection of special picks.</p>
          </div>
          <Sparkles size={30} className="text-[#c9e795]" aria-hidden="true" />
        </header>

        {loading ? (
          <BrandLoader label="Finding today’s specials…" />
        ) : hasError ? (
          <div className="rounded-2xl border border-[#dbe5d8] bg-white p-6 text-center">
            <p role="alert">We couldn’t load Specials right now.</p>
            <button type="button" disabled={specialsQuery.isFetching} onClick={() => void specialsQuery.refetch()}
              className="mt-3 min-h-11 rounded-xl bg-[#155344] px-5 font-semibold text-white disabled:opacity-60">
              {specialsQuery.isFetching ? 'Retrying…' : 'Try again'}
            </button>
          </div>
        ) : products.length === 0 ? (
          <section className="rounded-2xl border border-[#dbe5d8] bg-white px-5 py-9 text-center sm:py-12">
            <h2 className="text-xl font-semibold text-[#17372f]">{requestedPage > 1 && count > 0 ? 'No picks on this page' : 'No Specials available right now'}</h2>
            {requestedPage > 1 && count > 0 ? (
              <button type="button" onClick={() => goToPage(1)} className="mt-4 min-h-11 rounded-xl bg-[#155344] px-4 font-semibold text-white">Back to first page</button>
            ) : (
              <Link href="/flash-sale" prefetch={false} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#155344] px-4 text-sm font-semibold text-white">
                Browse Flash Sale <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </section>
        ) : (
          <>
            <p className="text-sm text-[#486357]" role="status">{specialsQuery.isPlaceholderData ? 'Loading next results…' : `${count} ${count === 1 ? 'product' : 'products'}`}</p>
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
                  disabled={currentPage <= 1 || specialsQuery.isPlaceholderData}
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
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
                  disabled={currentPage >= totalPages || specialsQuery.isPlaceholderData}
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
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
        <BrandLoader label="Finding today’s specials…" />
      }
    >
      <SpecialsPageContent />
    </Suspense>
  );
}

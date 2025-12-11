'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
};

async function fetchSpecials(): Promise<UIProduct[]> {
  const res = await fetch('/api/medusa/products?tag=Specials&limit=200', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Unable to load Specials');
  }
  const data = await res.json();
  return (data?.products || []) as UIProduct[];
}

export default function SpecialsPage() {
  const specialsQuery = useQuery({
    queryKey: ['specials-page'],
    queryFn: fetchSpecials,
    staleTime: 1000 * 60 * 5,
  });

  const products = specialsQuery.data ?? [];
  const loading = specialsQuery.isLoading;
  const hasError = specialsQuery.error;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            Specials
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900">Specials tagged products</h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Explore every product marked with the Specials tag across the store.
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
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {products.map((product) => (
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

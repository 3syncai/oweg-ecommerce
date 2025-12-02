"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { usePreferences } from '@/hooks/usePreferences';
import PreferenceModal from '@/components/modules/PreferenceModal';
import { ProductGrid } from '@/components/modules/ProductGrid';
import type { ProductCardProps } from '@/components/modules/ProductCard';

const PAGE_SIZE = 20;

export default function ForYouPage() {
  const { customer } = useAuth();
  const queryClient = useQueryClient();
  const { preferences, hasPreferences, shouldPrompt, loading: prefLoading, saving: prefSaving, savePreferences } = usePreferences();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (shouldPrompt) {
      setModalOpen(true);
    }
  }, [shouldPrompt]);

  const fetchPersonalizedPage = useCallback(
    async (pageToFetch: number) => {
      const params = new URLSearchParams({
        page: String(pageToFetch),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/personalized/products?${params.toString()}`, { cache: 'no-store' });
      if (res.status === 401) throw new Error('Please sign in to see your feed.');
      if (!res.ok) throw new Error('Unable to load personalized products.');
      const data = await res.json();
      return {
        products: (Array.isArray(data.products) ? data.products : []) as ProductCardProps[],
        total: Number(data.total) || 0,
      };
    },
    []
  );

  const productsQuery = useQuery<{ products: ProductCardProps[]; total: number }>({
    queryKey: ['personalized-products', page, preferences],
    enabled: Boolean(customer) && hasPreferences,
    placeholderData: (prev) => prev,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    queryFn: () => fetchPersonalizedPage(page),
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((productsQuery.data?.total || 0) / PAGE_SIZE)),
    [productsQuery.data?.total]
  );

  const canPageBack = page > 1;
  const canPageForward = page < totalPages;
  const initialLoading = productsQuery.isLoading && !productsQuery.data;
  const queryError =
    productsQuery.error instanceof Error
      ? productsQuery.error.message
      : productsQuery.error
        ? 'Unable to load personalized products.'
        : null;
  const hasProducts = (productsQuery.data?.products?.length || 0) > 0;
  const backgroundRefreshing = productsQuery.isFetching && hasProducts;

  useEffect(() => {
    if (!customer || !hasPreferences || !productsQuery.data?.products?.length) return;
    const nextPage = page + 1;
    if (nextPage > totalPages) return;
    void queryClient.prefetchQuery({
      queryKey: ['personalized-products', nextPage, preferences],
      queryFn: () => fetchPersonalizedPage(nextPage),
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 10,
    });
  }, [customer, fetchPersonalizedPage, hasPreferences, page, preferences, productsQuery.data?.products?.length, queryClient, totalPages]);

  if (!customer) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="max-w-3xl mx-auto rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center">
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sign in to unlock your picks</h1>
          <p className="text-gray-600 mb-6">
            Login to tell us what you love and we will keep this page fresh with those products.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow hover:bg-emerald-700"
            >
              Login
            </Link>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 bg-white"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="hidden md:inline-flex items-center gap-1 text-sm text-gray-600 hover:text-emerald-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
          <div>
            
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              
              Your personalized picks
            </h1>
            {!hasPreferences ? (
              <p className="text-sm text-gray-600">
                Set your preferences to start seeing tailored suggestions.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 bg-white hover:border-emerald-200"
          >
            {hasPreferences ? 'Edit preferences' : 'Set preferences'}
          </button>
          <button
            type="button"
            onClick={() => productsQuery.refetch()}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow hover:bg-emerald-700"
            disabled={productsQuery.isFetching}
          >
            {productsQuery.isFetching ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Refreshing
              </span>
            ) : (
              'Refresh'
            )}
          </button>
        </div>
      </div>

      {!hasPreferences && !prefLoading ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
           
            <div>
              <p className="text-sm font-semibold text-amber-800">We need your inputs</p>
              <p className="text-xs text-amber-700">Pick a few categories, product types, and brands to get started.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 rounded-xl border border-amber-200 bg-white text-sm font-semibold text-amber-800 hover:bg-amber-100"
          >
            Personalize now
          </button>
        </div>
      ) : null}

      {hasPreferences ? (
        <div className="space-y-4">
          {queryError && !productsQuery.data ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {queryError}
            </div>
          ) : hasProducts || initialLoading ? (
            <>
              <ProductGrid
                products={hasProducts ? productsQuery.data!.products : []}
                isLoading={initialLoading}
              />
              <div className="flex items-center justify-between text-sm text-gray-700">
                <span className="flex items-center gap-2">
                  Page {page} of {totalPages}
                  {backgroundRefreshing && <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-semibold disabled:opacity-50"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={!canPageBack}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-semibold disabled:opacity-50"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={!canPageForward}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-center">
              <p className="text-sm text-gray-700">No products matched your preferences yet. Try widening them.</p>
              <button
                type="button"
                className="mt-3 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 bg-white hover:border-emerald-200"
                onClick={() => setModalOpen(true)}
              >
                Update preferences
              </button>
            </div>
          )}
        </div>
      ) : null}

      <PreferenceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={async (prefs) => {
          try {
            await savePreferences(prefs);
            setModalOpen(false);
            setPage(1);
            void productsQuery.refetch();
          } catch (err) {
            console.error('Failed to save preferences', err);
          }
        }}
        saving={prefSaving}
        initial={preferences ?? undefined}
      />
    </div>
  );
}

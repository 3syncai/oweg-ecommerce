"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { Filter, Loader2 } from "lucide-react";
import {
  getCollectionLogoScale,
  getCollectionLogoUrl,
  normalizeBrandKey,
  resolveBrandLogo,
} from "@/lib/brand-logos";
import {
  BrandLogoImage,
  brandLogoFallbackHandler,
} from "@/components/modules/BrandLogoImage";

type Collection = {
  id: string;
  title?: string;
  handle?: string;
  metadata?: Record<string, unknown> | null;
};

const getSlug = (col: Collection) =>
  col.handle || normalizeBrandKey(col.title) || col.id;

export default function BrandsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCollections = async () => {
      try {
        setLoadingCollections(true);
        const res = await fetch("/api/medusa/collections", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Unable to load brands");
        const data = await res.json();
        setCollections((data.collections || []) as Collection[]);
      } catch {
        setError("Could not load brands right now.");
      } finally {
        setLoadingCollections(false);
      }
    };
    loadCollections();
  }, []);

  return (
    <div className="oweg-page min-h-screen">
      <div className="oweg-container space-y-8 py-10 md:space-y-10 md:py-16">
        <header className="space-y-3">
          {/* <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <BadgeCheck className="w-4 h-4" />
            Brands
          </div> */}
          <h1 className="oweg-title text-[clamp(1.6rem,1.1rem+2.4vw,2.5rem)]">
            Pick a brand to see everything from that collection.
          </h1>
          <p className="oweg-subtle max-w-2xl">
            Find every brand we offer in one clean grid. Select a brand to
            access its dedicated product catalog.
          </p>
        </header>

        <section className="oweg-surface-card space-y-4 bg-white/80 p-4 backdrop-blur sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--oweg-surface-tint)] px-3 py-1 text-xs font-semibold text-[var(--oweg-green-dark)]">
              <Filter className="w-4 h-4" />
              All brands
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
              {error}
            </div>
          ) : null}

          {loadingCollections ? (
            <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading brands...
            </div>
          ) : collections.length === 0 ? (
            <div className="text-sm text-gray-600">No brands found.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {collections.map((col) => {
                const logo = resolveBrandLogo({
                  title: col.title,
                  handle: col.handle,
                  logoUrl: getCollectionLogoUrl(col.metadata),
                  logoScale: getCollectionLogoScale(col.metadata),
                });
                const slug = getSlug(col);
                return (
                  <Link
                    key={col.id}
                    href={`/brands/${encodeURIComponent(slug)}`}
                    className="oweg-surface-card group flex items-center gap-3 p-4 transition hover:-translate-y-1 hover:border-[var(--oweg-green)] hover:shadow-[var(--oweg-shadow-lg)] sm:gap-4 sm:p-5"
                  >
                    <div className="oweg-icon-tile h-14 w-14 shrink-0 overflow-hidden p-1.5">
                      <BrandLogoImage
                        src={logo.src}
                        alt={col.title || "Brand logo"}
                        scale={logo.scale}
                        fillParent
                        onError={brandLogoFallbackHandler}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="truncate text-base font-semibold text-[var(--oweg-ink)] sm:text-lg">
                        {col.title || col.handle || "Brand"}
                      </p>
                      <p className="inline-flex items-center gap-1 text-xs text-[var(--oweg-ink-muted)]">
                        View products
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

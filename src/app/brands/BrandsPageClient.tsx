"use client";

import BrandLoader from "@/components/ui/BrandLoader";
import { useEffect, useState } from "react";

import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
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
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const search = query.trim().toLowerCase();
  const visibleBrands = collections.filter(col => (col.title || col.handle || "").toLowerCase().includes(search));

  useEffect(() => {
    const controller = new AbortController();
    const loadCollections = async () => {
      try {
        const res = await fetch("/api/medusa/collections", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Unable to load brands");
        const data = await res.json();
        if (controller.signal.aborted) return;
        setCollections((data.collections || []) as Collection[]);
      } catch {
        if (!controller.signal.aborted) setError("Could not load brands right now.");
      } finally {
        if (!controller.signal.aborted) setLoadingCollections(false);
      }
    };
    void loadCollections();
    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="oweg-page min-h-screen">
      <div className="oweg-container space-y-5 py-5 sm:space-y-7 sm:py-10">
        <header className="grid gap-5 rounded-3xl bg-[#e8f1e3] p-5 sm:grid-cols-[1fr_minmax(14rem,22rem)] sm:items-end sm:p-8">
          <div>
            <h1 className="oweg-title text-3xl sm:text-5xl">Shop by brand</h1>
            <p className="mt-2 text-sm text-[#486357] sm:text-base">Find your favourite brands and browse their products.</p>
          </div>
          <div className="relative flex min-w-0 items-center rounded-xl border border-[#bacdbd] bg-white">
            <Search size={19} className="pointer-events-none absolute left-3 text-[#416654]" aria-hidden="true" />
            <input aria-label="Find a brand" type="text" value={query} onChange={event => setQuery(event.target.value)}
              placeholder="Find a brand" className="min-h-12 w-full rounded-xl bg-transparent py-2 pl-10 pr-12 text-[#17372f] focus-visible:outline-2 focus-visible:outline-[#175344]" />
            {query && <button type="button" aria-label="Clear brand search" onClick={() => setQuery("")}
              className="absolute right-0 grid size-11 place-items-center rounded-xl text-[#416654] focus-visible:outline-2"><X size={18} aria-hidden="true" /></button>}
          </div>
        </header>

        <section aria-label="Brand directory">
          {error ? (
            <div className="rounded-2xl border border-[#dbe5d8] bg-white p-6 text-center">
              <p role="alert">{error}</p>
              <button type="button" onClick={() => { setError(null); setLoadingCollections(true); setAttempt(value => value + 1); }}
                className="mt-3 min-h-11 rounded-xl bg-[#155344] px-5 font-semibold text-white">Try again</button>
            </div>
          ) : loadingCollections ? (
            <BrandLoader compact label="Loading brands…" />
          ) : visibleBrands.length === 0 ? (
            <div className="rounded-2xl border border-[#dbe5d8] bg-white p-6 text-center">
              <p role="status">{search ? "No brands match your search." : "No brands are available right now."}</p>
              {search && <button type="button" onClick={() => setQuery("")} className="mt-2 min-h-11 px-2 font-semibold text-[#155344] underline">Clear search</button>}
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-[#486357]" role="status">{visibleBrands.length} {visibleBrands.length === 1 ? "brand" : "brands"}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibleBrands.map((col) => {
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
                      prefetch={false}
                      href={`/brands/${encodeURIComponent(slug)}`}
                      className="group relative flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-[#dbe5d8] bg-white p-3 text-center transition-colors hover:border-[#6f9a78] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155344] sm:p-4"
                    >
                      <div className="relative h-16 w-full max-w-28 overflow-hidden p-2 sm:h-20">
                        <BrandLogoImage
                          src={logo.src}
                          alt=""
                          scale={logo.scale}
                          fillParent
                          onError={brandLogoFallbackHandler}
                        />
                      </div>
                      <span className="w-full break-words px-1 text-sm font-semibold text-[#17372f] sm:text-base">{col.title || col.handle || "Brand"}</span>
                      <ArrowUpRight size={15} className="absolute right-2 top-2 text-[#416654]" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

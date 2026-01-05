"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {Filter, Loader2 } from "lucide-react";
import { getBrandLogoPath, normalizeBrandKey } from "@/lib/brand-logos";

type Collection = { id: string; title?: string; handle?: string };

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
        const res = await fetch("/api/medusa/collections", { cache: "no-store" });
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
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-16 space-y-10">
        <header className="space-y-3">
          {/* <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-xs font-semibold">
            <BadgeCheck className="w-4 h-4" />
            Brands
          </div> */}
          <h1 className="text-3xl sm:text-4xl font-semibold">Pick a brand to see everything from that collection.</h1>
          <p className="text-gray-600">
           Find every brand we offer in one clean grid. Select a brand to access its dedicated product catalog.
          </p>
        </header>

        <section className=" bg-white/80 backdrop-blur p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {collections.map((col) => {
                const logo = getBrandLogoPath(col.title, col.handle);
                const slug = getSlug(col);
                return (
                  <Link
                    key={col.id}
                    href={`/brands/${encodeURIComponent(slug)}`}
                    className="group  p-5  flex items-center gap-4 transition hover:-translate-y-1 hover:shadow-[0_22px_48px_-28px_rgba(0,0,0,0.45)]"
                  >
                    <div className="h-14 w-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden">
                      <Image
                        src={logo}
                        alt={col.title || "Brand logo"}
                        width={56}
                        height={56}
                        className="object-contain"
                        unoptimized
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (img.src.includes("oweg_logo")) return;
                          img.src = "/oweg_logo.png";
                        }}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-lg font-semibold text-gray-900">{col.title || col.handle || "Brand"}</p>
                      <p className="text-xs text-gray-500 inline-flex items-center gap-1">
                        
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

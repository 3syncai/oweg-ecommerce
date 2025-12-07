"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Loader2} from "lucide-react";
import { ProductCard } from "@/components/modules/ProductCard";
import { getBrandLogoPath, getBrandLogoScale, normalizeBrandKey } from "@/lib/brand-logos";

type Collection = { id: string; title?: string; handle?: string };
type UiProduct = {
  id: string;
  name: string;
  image: string;
  price: number;
  mrp: number;
  discount: number;
  limitedDeal?: boolean;
  variant_id?: string;
  handle?: string;
};

export default function BrandDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = decodeURIComponent(
    Array.isArray(params?.slug) ? params.slug[0] : (params?.slug as string | undefined) || ""
  );
  const fromHome = searchParams.get("from") === "home";

  const [collections, setCollections] = useState<Collection[]>([]);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [products, setProducts] = useState<UiProduct[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all collections once
  useEffect(() => {
    const loadCollections = async () => {
      try {
        setLoadingCollections(true);
        const res = await fetch("/api/medusa/collections", { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to load brands");
        const data = await res.json();
        const cols = (data.collections || []) as Collection[];
        setCollections(cols);
      } catch (err) {
        setError("Could not load brand info.");
        console.log(err)
      } finally {
        setLoadingCollections(false);
      }
    };
    loadCollections();
  }, []);

  // Resolve current collection from slug
  useEffect(() => {
    if (!collections.length || !slug) return;
    const normSlug = normalizeBrandKey(slug);
    const found =
      collections.find((c) => c.id === slug) ||
      collections.find((c) => (c.handle || "") === slug) ||
      collections.find((c) => normalizeBrandKey(c.title) === normSlug) ||
      collections.find((c) => normalizeBrandKey(c.handle) === normSlug);
    setCollection(found || null);
    if (!found) setError("Brand not found.");
  }, [collections, slug]);

  // Load products for the resolved collection
  useEffect(() => {
    if (!collection?.id) return;
    const loadProducts = async () => {
      try {
        setLoadingProducts(true);
        setError(null);
        const res = await fetch(`/api/medusa/products?collectionId=${encodeURIComponent(collection.id)}&limit=120`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Unable to load products");
        const data = await res.json();
        setProducts((data.products || []) as UiProduct[]);
      } catch (err) {
        setError("Could not load products for this brand.");
        setProducts([]);
        console.log(err)
      } finally {
        setLoadingProducts(false);
      }
    };
    loadProducts();
  }, [collection?.id]);

  const logo = useMemo(() => getBrandLogoPath(collection?.title, collection?.handle), [collection?.title, collection?.handle]);
  const logoScale = useMemo(() => getBrandLogoScale(collection?.title, collection?.handle), [collection?.title, collection?.handle]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white text-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-12 space-y-8">
        {!fromHome ? (
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/brands"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-gray-700 font-semibold hover:border-emerald-200 hover:text-emerald-700"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to brands
            </Link>
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
          <Link href="/" className="font-semibold text-emerald-700 hover:underline">
            Home
          </Link>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="font-semibold text-gray-900">{collection?.title || collection?.handle || "Brand"}</span>
        </div>

        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-white border border-gray-100 flex items-center justify-center overflow-hidden shadow-sm">
              <Image
                src={logo}
                alt={collection?.title || "Brand logo"}
                width={96}
                height={96}
                className="object-contain"
                style={{ transform: `scale(${logoScale})` }}
                unoptimized
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src.includes("oweg_logo")) return;
                  img.src = "/oweg_logo.png";
                }}
              />
            </div>
            <div className="space-y-1">
              
              <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900">
                {collection?.title || collection?.handle || "Brand"}
              </h1>
            </div>
          </div>
          {loadingProducts && (
            <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading products...
            </div>
          )}
        </header>

        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
            {error}
          </div>
        )}

        <section className="grid gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3">
          {loadingProducts || loadingCollections ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-gray-100 bg-white p-4 animate-pulse h-64"
              />
            ))
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-600">
              No products for this brand yet.
            </div>
          ) : (
            products.map((p) => <ProductCard key={p.id} {...p} />)
          )}
        </section>
      </div>
    </div>
  );
}

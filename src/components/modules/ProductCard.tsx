// ProductCard: Reusable card for product listings with hover effects and quick actions

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { useAddToCartWithNotification } from "@/hooks/useCartMutations";
import { useAddToWishlistWithNotification } from "@/hooks/useWishlistMutations";

export type ProductCardProps = {
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
  sourceCategoryId?: string;
  sourceCategoryHandle?: string;
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

export function ProductCard({
  id,
  name,
  image,
  price,
  mrp,
  discount,
  limitedDeal,
  variant_id,
  handle,
  sourceTag,
  sourceCategoryId,
  sourceCategoryHandle,
}: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [prefetched, setPrefetched] = useState(false);
  const { customer } = useAuth();
  const { addToCart, isLoading: isAddingToCart } = useAddToCartWithNotification(name);
  const { addToWishlist, isLoading: isAddingToWishlist } = useAddToWishlistWithNotification(name);
  const queryClient = useQueryClient();
  const router = useRouter();
  const cardRef = useRef<HTMLAnchorElement | null>(null);

  const params = new URLSearchParams();
  params.set("id", String(id));
  if (sourceTag) params.set("sourceTag", sourceTag);
  if (sourceCategoryId) params.set("sourceCategoryId", sourceCategoryId);
  if (sourceCategoryHandle) params.set("sourceCategoryHandle", sourceCategoryHandle);
  const productHref = `/productDetail/${encodeURIComponent(handle || id)}?${params.toString()}`;

  const isWishlisted = (() => {
    const list = (customer?.metadata as Record<string, unknown> | undefined)?.wishlist;
    if (!Array.isArray(list)) return false;
    return list.map((itemId) => String(itemId)).includes(String(id));
  })();

  const handleQuickAdd = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!variant_id) return;
    await addToCart(variant_id);
  };

  const handleWishlist = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await addToWishlist(id);
  };

  useEffect(() => {
    if (!cardRef.current || prefetched) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !prefetched) {
            // Prefetch page route
            router.prefetch(productHref);
            // Prefetch product detail into React Query cache
            void queryClient.prefetchQuery({
              queryKey: ["product-detail", String(id)],
              queryFn: async () => {
                const res = await fetch(`/api/medusa/products/${encodeURIComponent(String(id))}`, {
                  cache: "no-store",
                });
                if (!res.ok) throw new Error("Failed to prefetch product");
                const data = await res.json();
                return data as { product: unknown };
              },
              staleTime: 1000 * 60 * 3,
            });
            setPrefetched(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: "120px" }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [cardRef, id, prefetched, productHref, queryClient, router]);

  return (
    <Link
      ref={cardRef}
      href={productHref}
      className="group relative w-full bg-white rounded-lg overflow-visible shadow-sm hover:shadow-xl transition-all duration-300 hover:border-[#7AC943] border border-gray-200 flex flex-col h-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-square bg-gray-50 overflow-visible rounded-t-lg">
        <div className="absolute inset-0 overflow-hidden rounded-t-lg">
          <Image
            src={image}
            alt={name}
            fill
            className="object-contain p-3"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        </div>
        <div
          className={`absolute top-2 right-2 flex flex-col gap-2 z-30 transition-all duration-300 ${
            isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
          }`}
          style={{ pointerEvents: isHovered ? "auto" : "none" }}
        >
          <button
            type="button"
            onClick={handleQuickAdd}
            title="Add to Cart"
            disabled={!variant_id || isAddingToCart}
            className={`w-9 h-9 rounded-full text-white flex items-center justify-center shadow-lg ${
              variant_id
                ? "bg-green-500 hover:bg-green-600"
                : "bg-slate-400 cursor-not-allowed opacity-70"
            } ${isAddingToCart ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            +
          </button>
          <button
            type="button"
            onClick={handleWishlist}
            title="Add to Wishlist"
            disabled={isAddingToWishlist}
            className={`w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-lg border hover:text-red-500 transition ${
              isWishlisted ? "text-red-500 border-red-200" : "text-gray-700"
            } ${isAddingToWishlist ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <Heart className="w-4 h-4" fill={isWishlisted ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <div className="flex items-start gap-2 mb-2">
          <span className="bg-red-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
            {discount}% off
          </span>
          {limitedDeal && (
            <span className="bg-red-100 text-red-700 text-[11px] font-medium px-2 py-0.5 rounded-full">
              Limited
            </span>
          )}
        </div>
        <p className="text-sm text-gray-700 line-clamp-2 flex-1 mb-2">{name}</p>
        <div className="mt-auto">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-gray-900">{inr.format(price)}</span>
            <span className="text-xs text-gray-500 line-through">
              M.R.P: {inr.format(mrp)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}


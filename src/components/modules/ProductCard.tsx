// ProductCard: Reusable card for product listings with hover effects and quick actions

"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { useAddToWishlistWithNotification } from "@/hooks/useWishlistMutations";
import { ProductCardQuickActions } from "@/components/modules/ProductCardQuickActions";

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
  inventory_quantity?: number;
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
  inventory_quantity,
}: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [prefetched, setPrefetched] = useState(false);
  const { customer } = useAuth();
  const { addToWishlist, isLoading: isAddingToWishlist } = useAddToWishlistWithNotification(name);
  const router = useRouter();
  const cardRef = useRef<HTMLAnchorElement | null>(null);

  const isOutOfStock = typeof inventory_quantity !== "number" || inventory_quantity <= 0;

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

  const handleWishlist = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await addToWishlist(id);
  };

  const prefetchRoute = () => {
    if (prefetched) return;
    setPrefetched(true);
    router.prefetch(productHref);
  };

  return (
    <Link
      ref={cardRef}
      href={productHref}
      className="group relative flex h-full w-full flex-col overflow-visible rounded-[var(--oweg-radius-lg)] border border-[var(--oweg-border)] bg-white shadow-[var(--oweg-shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--oweg-green)] hover:shadow-[var(--oweg-shadow-md)]"
      onMouseEnter={() => {
        setIsHovered(true);
        prefetchRoute();
      }}
      onFocus={prefetchRoute}
      onTouchStart={prefetchRoute}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-square overflow-visible rounded-t-[var(--oweg-radius-lg)] bg-[var(--oweg-surface-subtle)]">
        <div className="absolute inset-0 overflow-hidden rounded-t-[var(--oweg-radius-lg)]">
          <Image
            src={image}
            alt={name}
            fill
            className={`object-contain p-3 transition-transform duration-300 ease-out group-hover:scale-[1.04] ${
              isOutOfStock ? "opacity-60 grayscale" : ""
            }`}
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
          />
        </div>
        {isOutOfStock && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-t-[var(--oweg-radius-lg)] bg-black/40">
            <div className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg sm:px-4 sm:py-2 sm:text-sm">
              OUT OF STOCK
            </div>
          </div>
        )}
        <ProductCardQuickActions
          variantId={variant_id}
          productName={name}
          disabled={isOutOfStock}
          isHovered={isHovered}
          inventoryQuantity={inventory_quantity}
        >
          <button
            type="button"
            onClick={handleWishlist}
            title="Add to Wishlist"
            disabled={isAddingToWishlist}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow-lg transition before:absolute before:-inset-1 before:content-[''] hover:text-red-500 ${
              isWishlisted ? "text-red-500 border-red-200" : "text-gray-700"
            } ${isAddingToWishlist ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <Heart className="w-4 h-4" fill={isWishlisted ? "currentColor" : "none"} />
          </button>
        </ProductCardQuickActions>
      </div>
      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
        <div className="mb-2 flex flex-wrap items-start gap-1.5">
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            {discount}% off
          </span>
          {limitedDeal && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
              Limited
            </span>
          )}
        </div>
        <p className="mb-2 line-clamp-2 flex-1 text-[13px] leading-snug text-[var(--oweg-ink-soft)] sm:text-sm">
          {name}
        </p>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-base font-bold text-[var(--oweg-ink)] sm:text-lg">
            {inr.format(price)}
          </span>
          <span className="text-xs text-[var(--oweg-ink-muted)] line-through">{inr.format(mrp)}</span>
        </div>
      </div>
    </Link>
  );
}

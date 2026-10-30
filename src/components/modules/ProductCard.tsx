// Shared product listing card; cart and wishlist use the existing mutation hooks.

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, ImageOff, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { useAddToWishlistWithNotification } from "@/hooks/useWishlistMutations";
import { ProductCardQuickActions } from "@/components/modules/ProductCardQuickActions";
import styles from "./ProductCard.module.css";

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
  showImageFallback?: boolean;
  prefetch?: boolean;
  rating?: number;
  reviewCount?: number;
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
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
  showImageFallback = true,
  prefetch,
  rating,
  reviewCount,
}: ProductCardProps) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [prefetched, setPrefetched] = useState(false);
  const { customer } = useAuth();
  const { addToWishlist, isLoading: isAddingToWishlist } = useAddToWishlistWithNotification(name);
  const router = useRouter();

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

  const hasRating = typeof rating === "number" && Number.isFinite(rating) && rating > 0 && rating <= 5 && typeof reviewCount === "number" && reviewCount > 0;

  return (
    <article className={styles.card} onMouseEnter={prefetchRoute} onFocus={prefetchRoute} onTouchStart={prefetchRoute}>
      <div className={styles.media}>
        <Link href={productHref} prefetch={prefetch} className={styles.imageFrame} aria-label={name}>
          {showImageFallback && failedImage === image ? (
            <div className={styles.imageFallback} role="img" aria-label={`${name}: image unavailable`}>
              <ImageOff size={28} aria-hidden />
              <span>Image unavailable</span>
            </div>
          ) : (
            <Image src={image} alt={name} fill className={`${styles.image} ${isOutOfStock ? styles.unavailable : ""}`} sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw" onError={showImageFallback ? () => setFailedImage(image) : undefined} />
          )}
          {isOutOfStock && <span className={styles.stockBadge}>Out of stock</span>}
        </Link>
        <button type="button" onClick={handleWishlist} disabled={isAddingToWishlist} aria-label={isWishlisted ? `${name} is in your wishlist` : `Add ${name} to wishlist`} aria-pressed={isWishlisted} className={styles.wishlist}>
          <Heart size={20} fill={isWishlisted ? "currentColor" : "none"} aria-hidden />
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.rating}>
          <Star size={13} fill={hasRating ? "currentColor" : "none"} aria-hidden />
          {hasRating ? <span>{rating.toFixed(1)} <span className={styles.reviewCount}>({new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(reviewCount)})</span></span> : <span className={styles.reviewCount}>No reviews yet</span>}
          {limitedDeal && <span className={styles.limited}>Limited</span>}
        </div>
        <Link href={productHref} prefetch={prefetch} className={styles.title}>{name}</Link>
        <div className={styles.pricing}>
          <div className={styles.amounts}>
            <span className={styles.price}>{inr.format(price)}</span>
            {mrp > price && <span className={styles.mrp}>{inr.format(mrp)}</span>}
          </div>
          {discount > 0 && mrp > price && <span className={styles.discount}>{discount}% OFF</span>}
        </div>
        <ProductCardQuickActions variantId={variant_id} productName={name} disabled={isOutOfStock} isHovered={false} inventoryQuantity={inventory_quantity} layout="inline" />
      </div>
    </article>
  );
}

"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, Heart, HeartOff, ImageOff, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import AccountLoginPrompt from "@/components/account/AccountLoginPrompt";
import { useAuth } from "@/contexts/AuthProvider";
import { cn } from "@/lib/utils";
import styles from "./WishlistContent.module.css";

type WishlistProduct = {
  id: string;
  title?: string;
  handle?: string;
  thumbnail?: string;
  images?: { url?: string }[];
  price?: number;
  mrp?: number;
  discount?: number;
  variant_id?: string;
  variants?: { id?: string }[];
};

type WishlistContentProps = {
  embedded?: boolean;
};

function WishlistSkeleton() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div
          key={`wishlist-skeleton-${idx}`}
          className={cn(styles.card, "animate-pulse")}
        >
          <div className={cn(styles.media, styles.skeletonBlock)} />
          <div className={styles.details}>
            <div className="h-3 w-16 rounded bg-[#edf0e8]" />
            <div className="h-4 w-full rounded bg-[#edf0e8]" />
            <div className="h-3 w-3/4 rounded bg-[#edf0e8]" />
            <div className="h-5 w-20 rounded bg-[#edf0e8]" />
          </div>
          <div className={styles.actions}>
            <div className="h-11 flex-1 rounded-xl bg-[#edf0e8]" />
            <div className="h-11 w-24 rounded-xl bg-[#edf0e8]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function WishlistImage({ src, title, priority }: { src: string; title: string; priority: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (failedSource === src) {
    return (
      <div className={styles.imageFallback} role="img" aria-label={`${title}: image unavailable`}>
        <ImageOff className="h-7 w-7 opacity-40" strokeWidth={1.25} />
        <span>Image unavailable</span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={title}
      fill
      className={styles.productImage}
      sizes="(max-width: 639px) 112px, (max-width: 1024px) 50vw, 33vw"
      priority={priority}
      onError={() => setFailedSource(src)}
    />
  );
}

export default function WishlistContent({ embedded = false }: WishlistContentProps) {
  const { customer, setCustomer } = useAuth();
  const queryClient = useQueryClient();

  const currency = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    []
  );

  const wishlistQuery = useQuery<WishlistProduct[]>({
    queryKey: ["wishlist", customer?.id],
    enabled: Boolean(customer?.id),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    placeholderData: () =>
      customer?.id
        ? queryClient.getQueryData<WishlistProduct[]>(["wishlist", customer.id]) || []
        : [],
    queryFn: async () => {
      const res = await fetch("/api/medusa/wishlist", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to load your wishlist.");
      }
      return Array.isArray(data?.products) ? (data.products as WishlistProduct[]) : [];
    },
  });

  const products: WishlistProduct[] = wishlistQuery.data ?? [];
  const showSkeleton =
    Boolean(customer) &&
    (wishlistQuery.isLoading ||
      (wishlistQuery.isFetching && (!wishlistQuery.data || wishlistQuery.data.length === 0)));
  const refreshing = Boolean(customer) && wishlistQuery.isFetching && products.length > 0;
  const errorMessage =
    wishlistQuery.error instanceof Error
      ? wishlistQuery.error.message
      : wishlistQuery.error
        ? "Unable to load your wishlist."
        : null;

  const handleRemove = async (productId: string) => {
    try {
      const res = await fetch("/api/medusa/wishlist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (data && (data.error || data.message)) || "Unable to remove item.";
        throw new Error(message);
      }
      queryClient.setQueryData<WishlistProduct[]>(["wishlist", customer?.id], (prev) =>
        (prev || []).filter((p) => p.id !== productId)
      );
      if (data?.wishlist && Array.isArray(data.wishlist) && customer) {
        setCustomer({
          ...customer,
          metadata: {
            ...(customer.metadata || {}),
            wishlist: data.wishlist,
          },
        });
      }
      toast.success("Removed from wishlist");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to remove item.";
      toast.error(message);
    }
  };

  const handleAddToCart = async (product: WishlistProduct) => {
    const variantId = product?.variant_id || product?.variants?.[0]?.id;
    if (!variantId) {
      toast.error("No variant available to add to cart.");
      return;
    }
    try {
      await fetch("/api/medusa/cart", { method: "POST", credentials: "include" });
      const res = await fetch("/api/medusa/cart/line-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (data && (data.error || data.message)) || "Unable to add to cart.";
        throw new Error(message);
      }
      toast.success("Added to cart");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to add to cart.";
      toast.error(message);
    }
  };

  if (!customer) {
    return (
      <AccountLoginPrompt
        redirect={embedded ? "/account/wishlist" : "/wishlist"}
        title="Sign in to view your wishlist"
        description="Login to see items you've saved for later."
      />
    );
  }

  const emptyState = !showSkeleton && !products.length && !errorMessage;
  return (
    <div className={cn(styles.page, embedded && styles.embedded)} data-wishlist-page>
      <div className={cn(styles.content, !embedded && "oweg-container")}>
        <header className={styles.header}>
          <div>
            <div className={styles.heading}>
              <span className={styles.headingIcon}>
                <AccountHubIcon name="wishlist" size={22} className="h-[22px] w-[22px]" />
              </span>
              <div>
                <p className={styles.eyebrow}>Saved for later</p>
                <h1>Wishlist</h1>
              </div>
            </div>
            <p className={styles.lead}>Keep your favourites together. Add them to your cart when you&apos;re ready.</p>
          </div>
          <div className={styles.headerActions}>
            {!showSkeleton && !errorMessage ? (
              <span className={styles.savedCount}><Heart className="h-3.5 w-3.5" />{products.length} saved {products.length === 1 ? "item" : "items"}</span>
            ) : null}
            {refreshing ? (
              <span className={styles.refreshing} role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" />Updating...</span>
            ) : null}
            {!emptyState && !showSkeleton && products.length > 0 ? (
              <Link href="/" className={styles.shoppingLink}>Continue shopping <ArrowUpRight className="h-4 w-4" /></Link>
            ) : null}
          </div>
        </header>

        {showSkeleton ? (
          <WishlistSkeleton />
        ) : errorMessage ? (
          <div className={styles.error} role="alert">
            <AlertCircle className="h-5 w-5 shrink-0" /><span>{errorMessage}</span>
          </div>
        ) : emptyState ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><Heart className="h-8 w-8" strokeWidth={1.5} /></span>
            <h2>Your wishlist is empty</h2>
            <p>
              Tap the heart icon on any product to save it here.
            </p>
            <Link
              href="/"
              className={styles.primaryButton}
            >
              Continue shopping
            </Link>
          </div>
        ) : (
          <div className={styles.grid}>
            {products.map((product) => {
              const image =
                product.thumbnail ||
                (Array.isArray(product.images) && product.images.length
                  ? product.images[0]?.url
                  : undefined) ||
                "/oweg_logo.png";
              const slug = encodeURIComponent(String(product.handle || product.id));
              const href = `/productDetail/${slug}?id=${encodeURIComponent(String(product.id))}`;
              const discount =
                typeof product.discount === "number" && Number.isFinite(product.discount)
                  ? product.discount
                  : typeof product.price === "number" &&
                      typeof product.mrp === "number" &&
                      product.mrp > product.price
                    ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
                    : 0;
              const limited = discount >= 20;

              return (
                <article
                  key={product.id}
                  className={styles.card}
                >
                  <Link
                    href={href}
                    className={styles.media}
                    aria-label={`View ${product.title || "product"}`}
                  >
                    <WishlistImage
                      src={image}
                      title={product.title || "Product"}
                      priority={products.length < 4}
                    />
                  </Link>
                  <div className={styles.details}>
                    <div className={styles.badges}>
                      {discount > 0 ? (
                        <span className={styles.discount}>
                          {discount}% off
                        </span>
                      ) : null}
                      {limited ? (
                        <span className={styles.limited}>
                          Limited
                        </span>
                      ) : null}
                    </div>
                    <Link
                      href={href}
                      className={styles.title}
                    >
                      {product.title || "Product"}
                    </Link>
                    <div className={styles.prices}>
                      {typeof product.price === "number" ? (
                        <span className={styles.price}>
                          {currency.format(product.price)}
                        </span>
                      ) : null}
                      {typeof product.mrp === "number" && product.mrp > (product.price || 0) ? (
                        <span className={styles.mrp}>
                          {currency.format(product.mrp)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => void handleAddToCart(product)}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      <span>Add to cart</span>
                    </button>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => void handleRemove(product.id)}
                      aria-label="Remove from wishlist"
                    >
                      <HeartOff className="h-4 w-4" />
                      <span>Remove</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

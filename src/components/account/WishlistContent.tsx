"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, HeartOff, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import AccountLoginPrompt from "@/components/account/AccountLoginPrompt";
import { useAuth } from "@/contexts/AuthProvider";
import { cn } from "@/lib/utils";

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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-5">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div
          key={`wishlist-skeleton-${idx}`}
          className="flex min-h-[340px] animate-pulse flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="relative aspect-[4/5] bg-gray-100" />
          <div className="flex flex-1 flex-col space-y-3 p-4">
            <div className="h-4 w-24 rounded bg-gray-100" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-3 w-1/2 rounded bg-gray-100" />
            <div className="mt-auto flex gap-2">
              <div className="h-10 flex-1 rounded-full bg-gray-100" />
              <div className="h-10 w-10 rounded-full bg-gray-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
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
  const wrapperClass = embedded ? "space-y-5" : "container mx-auto max-w-6xl space-y-6 px-4 py-10";

  return (
    <div className={wrapperClass}>
      {!embedded ? (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF8E7]">
            <AccountHubIcon name="wishlist" size={22} className="h-[22px] w-[22px]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#1F2A33]">Wishlist</h1>
            <p className="text-sm text-gray-600">
              Save products to view later and add to cart when you&apos;re ready.
            </p>
          </div>
          {refreshing ? (
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating...
            </div>
          ) : null}
        </div>
      ) : null}

      {showSkeleton ? (
        <WishlistSkeleton />
      ) : errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : emptyState ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF8E7]">
            <Heart className="h-5 w-5 text-[#66C940]" />
          </div>
          <p className="text-lg font-semibold text-[#1F2A33]">Your wishlist is empty</p>
          <p className="mt-1 text-sm text-gray-500">
            Tap the heart icon on any product to save it here.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#66C940] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5ab838]"
          >
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-5">
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
              <div
                key={product.id}
                className="flex min-h-[390px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-[#66C940]/30 hover:shadow-md"
              >
                <Link
                  href={href}
                  className="relative block aspect-[4/5] max-h-64 overflow-hidden bg-[#EAF8E7]/30"
                >
                  <Image
                    src={image}
                    alt={product.title || "Product"}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    priority={products.length < 4}
                  />
                </Link>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start gap-2">
                    {discount > 0 ? (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {discount}% off
                      </span>
                    ) : null}
                    {limited ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                        Limited
                      </span>
                    ) : null}
                  </div>
                  <Link
                    href={href}
                    className="line-clamp-2 text-sm font-semibold text-[#1F2A33] transition hover:text-[#66C940]"
                  >
                    {product.title || "Product"}
                  </Link>
                  <div className="flex items-baseline gap-2 text-sm">
                    {typeof product.price === "number" ? (
                      <span className="text-lg font-bold text-[#1F2A33]">
                        {currency.format(product.price)}
                      </span>
                    ) : null}
                    {typeof product.mrp === "number" && product.mrp > (product.price || 0) ? (
                      <span className="text-xs text-gray-400 line-through">
                        M.R.P: {currency.format(product.mrp)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#66C940] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#5ab838] sm:px-4 sm:py-2.5 lg:py-3 lg:text-base"
                      )}
                      onClick={() => void handleAddToCart(product)}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      <span className="hidden sm:inline">Add to cart</span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-rose-500 transition hover:border-rose-200 hover:bg-rose-50 sm:px-4 sm:py-2.5 lg:py-3"
                      onClick={() => void handleRemove(product.id)}
                      aria-label="Remove from wishlist"
                    >
                      <HeartOff className="h-4 w-4" />
                      <span className="hidden sm:inline">Remove</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

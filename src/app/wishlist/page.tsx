"use client"

import { useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Heart, HeartOff, Loader2, ShoppingCart } from "lucide-react"
import { useAuth } from "@/contexts/AuthProvider"
import { toast } from "sonner"

type WishlistProduct = {
  id: string
  title?: string
  handle?: string
  thumbnail?: string
  images?: { url?: string }[]
  price?: number
  mrp?: number
  discount?: number
  variant_id?: string
  variants?: { id?: string }[]
}

export default function WishlistPage() {
  const { customer, setCustomer } = useAuth()
  const queryClient = useQueryClient()
  const wishlistIds = useMemo(() => {
    const raw = (customer?.metadata as Record<string, unknown> | undefined)?.wishlist
    return Array.isArray(raw) ? raw.map((id) => String(id)).filter(Boolean) : []
  }, [customer?.metadata])
  const hasWishlist = wishlistIds.length > 0

  const currency = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    []
  )

  const wishlistQuery = useQuery<WishlistProduct[]>({
    queryKey: ["wishlist"],
    enabled: Boolean(customer) && hasWishlist,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    keepPreviousData: true,
    queryFn: async () => {
      const res = await fetch("/api/medusa/wishlist", { credentials: "include", cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || "Unable to load your wishlist.")
      }
      const items = Array.isArray(data?.products) ? (data.products as WishlistProduct[]) : []
      return items
    },
  })

  const products = wishlistQuery.data ?? []
  const loading = Boolean(customer) && hasWishlist && wishlistQuery.isLoading && !wishlistQuery.data
  const refreshing =
    Boolean(customer) && hasWishlist && wishlistQuery.isFetching && Boolean(wishlistQuery.data?.length)
  const errorMessage =
    wishlistQuery.error instanceof Error
      ? wishlistQuery.error.message
      : wishlistQuery.error
        ? "Unable to load your wishlist."
        : null

  const handleRemove = async (productId: string) => {
    try {
      const res = await fetch("/api/medusa/wishlist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const message = (data && (data.error || data.message)) || "Unable to remove item."
        throw new Error(message)
      }
      queryClient.setQueryData<WishlistProduct[]>(["wishlist"], (prev) =>
        (prev || []).filter((p) => p.id !== productId)
      )
      if (data?.wishlist && Array.isArray(data.wishlist) && customer) {
        setCustomer({
          ...customer,
          metadata: {
            ...(customer.metadata || {}),
            wishlist: data.wishlist,
          },
        })
      }
      toast.success("Removed from wishlist")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to remove item."
      toast.error(message)
    }
  }

  const handleAddToCart = async (product: WishlistProduct) => {
    const variantId = product?.variant_id || product?.variants?.[0]?.id
    if (!variantId) {
      toast.error("No variant available to add to cart.")
      return
    }
    try {
      await fetch("/api/medusa/cart", { method: "POST", credentials: "include" })
      const res = await fetch("/api/medusa/cart/line-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const message = (data && (data.error || data.message)) || "Unable to add to cart."
        throw new Error(message)
      }
      toast.success("Added to cart")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to add to cart."
      toast.error(message)
    }
  }

  const emptyState = !loading && (!hasWishlist || !products.length) && !errorMessage && Boolean(customer)
  const showLoginPrompt = !customer

  const renderSkeletons = () => (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div
          key={`wishlist-skeleton-${idx}`}
          className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col animate-pulse min-h-[340px]"
        >
          <div className="relative aspect-[4/5] bg-gray-100" />
          <div className="p-4 space-y-3 flex-1 flex flex-col">
            <div className="h-4 w-24 rounded bg-gray-100" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-3 w-1/2 rounded bg-gray-100" />
            <div className="mt-auto flex gap-2">
              <div className="h-10 rounded-full bg-gray-100 flex-1" />
              <div className="h-10 w-10 rounded-full bg-gray-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="container max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-full bg-emerald-50 text-emerald-600">
          <Heart className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Wishlist</h1>
          <p className="text-sm text-slate-600">
            Save products to view later and add to cart when you&apos;re ready.
          </p>
        </div>
        {refreshing && (
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Updating...
          </div>
        )}
      </div>

      {loading ? (
        renderSkeletons()
      ) : errorMessage ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 text-sm">
          {errorMessage}
        </div>
      ) : showLoginPrompt ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-8 text-center">
          <p className="text-lg font-semibold text-slate-800 mb-2">Sign in to view your wishlist</p>
          <p className="text-sm text-slate-500 mb-4">Login to see items you&apos;ve saved for later.</p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/login" className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition">
              Login
            </Link>
            <Link href="/signup" className="px-4 py-2 rounded-full border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition">
              Create account
            </Link>
          </div>
        </div>
      ) : emptyState ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-8 text-center">
          <p className="text-lg font-semibold text-slate-800 mb-2">Your wishlist is empty</p>
          <p className="text-sm text-slate-500 mb-4">Tap the heart icon on any product to save it here.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 transition"
          >
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
          {products.map((p) => {
            const image =
              p.thumbnail ||
              (Array.isArray(p.images) && p.images.length ? p.images[0]?.url : undefined) ||
              "/oweg_logo.png"
            const slug = encodeURIComponent(String(p.handle || p.id))
            const href = `/productDetail/${slug}?id=${encodeURIComponent(String(p.id))}`
            const discount =
              typeof p.discount === "number" && Number.isFinite(p.discount)
                ? p.discount
                : typeof p.price === "number" &&
                  typeof p.mrp === "number" &&
                  p.mrp > p.price
                ? Math.round(((p.mrp - p.price) / p.mrp) * 100)
                : 0
            const limited = discount >= 20
            return (
              <div key={p.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col hover:shadow-lg transition min-h-[390px]">
                <Link href={href} className="relative aspect-[4/5] bg-gray-50 overflow-hidden block max-h-64">
                  <Image
                    src={image}
                    alt={p.title || "Product"}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    priority={products.length < 4}
                  />
                </Link>
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <div className="flex items-start gap-2">
                    {discount > 0 && (
                      <span className="bg-red-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
                        {discount}% off
                      </span>
                    )}
                    {limited && (
                      <span className="bg-red-100 text-red-700 text-[11px] font-medium px-2 py-0.5 rounded-full">
                        Limited
                      </span>
                    )}
                  </div>
                  <Link href={href} className="text-sm font-semibold text-slate-900 line-clamp-2 hover:text-emerald-700 transition">
                    {p.title || "Product"}
                  </Link>
                  <div className="flex items-baseline gap-2 text-sm">
                    {typeof p.price === "number" && (
                      <span className="text-lg font-bold text-slate-900">{currency.format(p.price)}</span>
                    )}
                    {typeof p.mrp === "number" && p.mrp > (p.price || 0) && (
                      <span className="text-xs text-slate-400 line-through">M.R.P: {currency.format(p.mrp)}</span>
                    )}
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <button
                      type="button"
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 text-white text-sm font-semibold px-3 py-2 hover:bg-emerald-700 transition sm:px-4 sm:py-2.5 lg:py-3 lg:text-base"
                      onClick={() => handleAddToCart(p)}
                    >
                      <ShoppingCart className="w-4 h-4" />
                      <span className="hidden sm:inline">Add to cart</span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-full border border-slate-200 text-rose-500 hover:bg-rose-50 transition sm:px-4 sm:py-2.5 lg:py-3"
                      onClick={() => handleRemove(p.id)}
                      aria-label="Remove from wishlist"
                    >
                      <HeartOff className="w-4 h-4" />
                      <span className="hidden sm:inline">Remove</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

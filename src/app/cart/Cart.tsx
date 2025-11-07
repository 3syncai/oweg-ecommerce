"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, X, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CartItemUI {
  id: string;
  name: string;
  price: number; // major unit (e.g., 350 -> ₹350)
  quantity: number;
  image?: string;
  currency?: string;
  meta?: {
    productId?: string;
    categories?: string[];
    categoryHandles?: string[];
    tags?: string[];
    type?: string;
    collectionId?: string;
  };
}

type ApiCart = Record<string, unknown>;

/**
 * Safe helpers to read unknown API shapes
 */
const toNumber = (v: unknown, fallback = 0): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};

const toStringOrUndefined = (v: unknown): string | undefined =>
  typeof v === "string" ? v : v == null ? undefined : String(v);

const Cart: React.FC = () => {
  const [cartItems, setCartItems] = useState<CartItemUI[]>([]);
  const [couponCode, setCouponCode] = useState<string>("");
  const [mounted, setMounted] = useState<boolean>(false);
  const [removingIds, setRemovingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  // Force rupee symbol/format regardless of backend locale
  const formatCurrency = (value: number | null | undefined): string => {
    const v = typeof value === "number" ? value : 0;
    try {
      // Use en-IN grouping but prefix explicit ₹ to avoid locale auto-selection
      const formatted = new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: Number.isInteger(v) ? 0 : 2,
      }).format(v);
      return `₹${formatted}`;
    } catch {
      return `₹${Math.round(Number(v))}`;
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadCart(): Promise<void> {
      try {
        const res = await fetch("/api/medusa/cart", { cache: "no-store" });
        if (!res.ok) {
          // fallback demo items if API not available
          if (!cancelled) {
            setCartItems([
              {
                id: "demo-1",
                name: "24 Energy 100 Watt Emergency Bulb",
                price: 490,
                quantity: 1,
                image: "/next.svg",
                currency: "INR",
              },
              {
                id: "demo-2",
                name: "24 Energy High Quality Mosquito Bat With Led Light",
                price: 350,
                quantity: 2,
                image: "/next.svg",
                currency: "INR",
              },
            ]);
          }
          return;
        }

        const data = (await res.json()) as ApiCart;
        const cart = (data?.cart ?? data) as ApiCart | undefined;

        // Currency detection (not currently used but kept for future use)
        // const regionCurrency =
        //   (cart && (cart.region as ApiCart)?.currency_code) ||
        //   (cart && cart.currency_code);

        const rawItems =
          (cart && ((cart.items as unknown) ?? (cart.line_items as unknown))) ??
          [];

        const itemsArr = Array.isArray(rawItems) ? rawItems : [];

        const mapped: CartItemUI[] = itemsArr.map((element) => {
          if (typeof element !== "object" || element === null) {
            // fallback empty item
            return {
              id: String(Math.random()),
              name: "Item",
              price: 0,
              quantity: 1,
            };
          }
          const it = element as ApiCart;
          const name =
            toStringOrUndefined(it.title) ||
            toStringOrUndefined(it.product_title) ||
            toStringOrUndefined((it.variant as ApiCart)?.title) ||
            toStringOrUndefined(((it.variant as ApiCart)?.product as ApiCart)?.title) ||
            "Item";
          const image =
            toStringOrUndefined(it.thumbnail) ||
            toStringOrUndefined(it.image) ||
            toStringOrUndefined(((it.variant as ApiCart)?.product as ApiCart)?.thumbnail);

          const variant = (it.variant as ApiCart) || ({} as ApiCart);
          const product = (variant.product as ApiCart) || ({} as ApiCart);
          const productId = toStringOrUndefined(product.id) || toStringOrUndefined(variant.product_id) || toStringOrUndefined((it as ApiCart).product_id);
          const categoriesArr = Array.isArray((product as ApiCart)?.categories) ? ((product as ApiCart).categories as ApiCart[]) : [];
          const categories = categoriesArr
            .map((c) => toStringOrUndefined((c as ApiCart).name) || toStringOrUndefined((c as ApiCart).title) || toStringOrUndefined((c as ApiCart).handle))
            .filter(Boolean) as string[];
          const categoryHandles = categoriesArr
            .map((c) => toStringOrUndefined((c as ApiCart).handle))
            .filter(Boolean) as string[];
          const tagsArr = Array.isArray((product as ApiCart)?.tags) ? ((product as ApiCart).tags as ApiCart[]) : [];
          const tags = tagsArr
            .map((t) => toStringOrUndefined((t as ApiCart).value) || toStringOrUndefined((t as ApiCart).handle))
            .filter(Boolean) as string[];
          const typeVal =
            toStringOrUndefined(((product as ApiCart)?.type as ApiCart)?.value) ||
            toStringOrUndefined(((product as ApiCart)?.type as ApiCart)?.handle) ||
            toStringOrUndefined((it as ApiCart).product_type) ||
            undefined;
          const collectionId =
            toStringOrUndefined((product as ApiCart)?.collection_id) ||
            toStringOrUndefined(((product as ApiCart)?.collection as ApiCart)?.id) ||
            undefined;

          const qty = Math.max(1, toNumber(it.quantity, 1));
          // attempt to read price-like fields
          const unitMinor = toNumber(
            it.unit_price ?? it.price ?? it.amount ?? (it.total ? toNumber((it.total as unknown), 0) / Math.max(qty, 1) : 0),
            0
          );

          // Heuristic: if provider returned minor units (paise/cents) convert if > 1000
          const unitMajor = unitMinor > 1000 ? unitMinor / 100 : unitMinor;

          return {
            id: String(it.id ?? Math.random().toString(36).slice(2, 9)),
            name: String(name),
            image: image ? String(image) : undefined,
            quantity: qty,
            price: Number(unitMajor),
            currency: typeof regionCurrency === "string" ? regionCurrency.toUpperCase() : undefined,
            meta: {
              productId: productId,
              categories,
              categoryHandles,
              tags,
              type: typeVal,
              collectionId,
            },
          };
        });

        if (!cancelled) {
          setCartItems(mapped);
        }
      } catch {
        // ignore and keep demo if set
      }
    }

    loadCart();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateQuantity = (id: string, newQuantity: number): void => {
    if (newQuantity < 1) return;
    setCartItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity: newQuantity } : item))
    );
  };

  const removeItem = (id: string): void => {
    setRemovingIds((s) => ({ ...s, [id]: true }));
    // delay to let animation run
    window.setTimeout(() => {
      setCartItems((prev) => prev.filter((it) => it.id !== id));
      setRemovingIds((s) => {
        const copy = { ...s };
        delete copy[id];
        return copy;
      });
    }, 320);
  };

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = 0;
  const total = subtotal + shipping;

  // Recommended products from cart item relations (type/tag/category)
  type UIProduct = {
    id: string | number;
    name: string;
    image: string;
    price: number;
    mrp: number;
    discount: number;
    variant_id?: string;
  };
  const [recommended, setRecommended] = useState<UIProduct[]>([]);
  const [loadingRecommended, setLoadingRecommended] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadRelated() {
      if (!cartItems.length) {
        setRecommended([]);
        return;
      }
      setLoadingRecommended(true);
      try {
        const typeSet = new Set<string>();
        const tagSet = new Set<string>();
        const catSet = new Set<string>();
        const excludeIds = new Set<string | undefined>();
        for (const it of cartItems) {
          if (it.meta?.type) typeSet.add(it.meta.type);
          for (const t of it.meta?.tags || []) tagSet.add(t);
          for (const c of it.meta?.categories || []) catSet.add(c);
          excludeIds.add(it.meta?.productId);
        }

        const picks: Array<{ kind: "type" | "tag" | "category"; v: string }> = [];
        for (const v of Array.from(typeSet).slice(0, 2)) picks.push({ kind: "type", v });
        for (const v of Array.from(tagSet).slice(0, 2)) picks.push({ kind: "tag", v });
        for (const v of Array.from(catSet).slice(0, 2)) picks.push({ kind: "category", v });
        if (!picks.length) {
          setRecommended([]);
          return;
        }

        const results = await Promise.all(
          picks.map(async (p) => {
            try {
              const r = await fetch(`/api/medusa/products?${p.kind}=${encodeURIComponent(p.v)}&limit=12`, { cache: "no-store" });
              if (!r.ok) return { products: [] } as { products: UIProduct[] };
              return (await r.json()) as { products: UIProduct[] };
            } catch {
              return { products: [] } as { products: UIProduct[] };
            }
          })
        );

        const seen = new Set<string | number>();
        const flat: UIProduct[] = [];
        for (const res of results) {
          for (const p of res.products || []) {
            if (excludeIds.has(String(p.id))) continue;
            const key = `${p.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            flat.push(p);
          }
        }
        if (!cancelled) setRecommended(flat.slice(0, 9));
      } finally {
        if (!cancelled) setLoadingRecommended(false);
      }
    }
    loadRelated();
    return () => {
      cancelled = true;
    };
  }, [cartItems]);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      <main className="flex-1 bg-[url('/grid-bg.svg')] bg-white/40">
        <div className="container mx-auto px-4 py-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-3 mb-8">
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-700 transition">
              Home
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium bg-green-100 text-green-700 px-3 py-1 rounded">
              Cart
            </span>
          </div>

          {/* Cart Table */}
          <div className="bg-white rounded-xl border shadow-sm mb-8 overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b bg-slate-50 text-slate-600 font-medium">
              <div className="col-span-6">Product</div>
              <div className="col-span-2">Price</div>
              <div className="col-span-2">Quantity</div>
              <div className="col-span-2 text-right">Subtotal</div>
            </div>

            <div className="space-y-4 px-2 py-6 md:px-6">
              {cartItems.length === 0 && (
                <div className="text-center py-8 text-slate-500">Your cart is empty.</div>
              )}
              {cartItems.map((item) => {
                const isRemoving = !!removingIds[item.id];
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col md:flex-row items-center gap-4 md:gap-6 p-4 md:p-0 md:py-4 bg-white rounded transition-all transform ${
                      mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
                    } ${isRemoving ? "opacity-0 scale-95" : ""}`}
                    style={{ transitionDuration: "320ms" }}
                  >
                    {/* Product */}
                    <div className="flex items-center gap-4 w-full md:w-3/5">
                      <button
                        onClick={() => removeItem(item.id)}
                        title="Remove item"
                        className="text-red-500 hover:bg-red-50 rounded-full p-1 transition"
                        aria-label={`Remove ${item.name}`}
                        type="button"
                      >
                        <X className="w-5 h-5" />
                      </button>

                      <div className="w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-slate-100 flex items-center justify-center shadow-sm">
                        {item.image ? (
                          <Image src={item.image} alt={item.name} width={80} height={80} className="w-full h-full object-cover" />
                          <Image src={item.image} alt={item.name} width={80} height={80} className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-slate-400">No image</div>
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="text-sm md:text-base font-medium text-slate-800 line-clamp-2">
                          {item.name}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 hidden md:block">
                          SKU: {item.id}
                        </div>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="w-full md:w-1/6 flex items-center justify-between md:justify-start md:pl-4">
                      <div className="text-sm md:text-base font-medium">
                        {formatCurrency(item.price)}
                      </div>
                    </div>

                    {/* Quantity */}
                    <div className="w-full md:w-1/6 flex items-center justify-center">
                      <div className="flex items-center border rounded-md overflow-hidden">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          aria-label="Decrease"
                          className="px-3 py-2 hover:bg-slate-50 transition"
                          type="button"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="px-4 text-sm font-medium w-12 text-center">{String(item.quantity).padStart(2, "0")}</div>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          aria-label="Increase"
                          className="px-3 py-2 hover:bg-slate-50 transition"
                          type="button"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Subtotal */}
                    <div className="w-full md:w-1/6 flex items-center justify-end md:pr-4">
                      <div className="text-sm md:text-base font-semibold">{formatCurrency(item.price * item.quantity)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions and Cart Total */}
          <div className="grid md:grid-cols-2 gap-8 mb-12 items-start">
            {/* Left: actions and coupon */}
            <div className="space-y-6">
              <div className="flex flex-wrap gap-4">
                <Button variant="outline" className="px-6 py-3 border-slate-200 hover:border-green-400 hover:text-green-700 transition">
                  <Link href="/">Return To Shop</Link>
                </Button>
                <Button
                  variant="outline"
                  className="px-6 py-3 border-slate-200 hover:border-green-400 hover:text-green-700 transition"
                  onClick={() => {
                    // demo update
                    // In production, call your API to sync cart.
                    alert("Cart updated (demo).");
                  }}
                >
                  Update Cart
                </Button>
              </div>

              <div className="flex gap-4 items-center">
                <Input
                  type="text"
                  placeholder="Coupon Code"
                  value={couponCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCouponCode(e.target.value)}
                  className="flex-1"
                />
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 transition"
                  onClick={() => {
                    alert(`Applying coupon: ${couponCode || "(empty)"}`);
                  }}
                >
                  Apply Coupon
                </Button>
              </div>

              {/* Recommended */}
              <div>
                <h2 className="text-lg font-semibold mb-4">Customers Who Brought Items in Your Recent History Also Bought</h2>
                {loadingRecommended && (
                  <div className="text-sm text-slate-500 mb-2">Finding related products…</div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {recommended.map((p) => (
                    <div key={p.id} className="border rounded-lg overflow-hidden bg-white hover:shadow-lg transition transform hover:-translate-y-1">
                      <div className="relative aspect-[4/3] bg-slate-50 flex items-center justify-center">
                        <Image src={p.image} alt={p.name} width={300} height={225} className="w-full h-full object-cover" />
                        <button
                          title="Add"
                          type="button"
                          className="absolute bottom-3 right-3 w-10 h-10 bg-green-600 hover:bg-green-700 text-white rounded-full flex items-center justify-center transition"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                        <div className="absolute top-3 left-3 flex gap-2">
                          <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-semibold">{p.discount}% off</span>
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-medium text-slate-800 line-clamp-2">{p.name}</p>
                        <div className="flex items-baseline gap-3 mt-2">
                          <div className="text-xl font-bold">{formatCurrency(p.price)}</div>
                          <div className="text-sm text-slate-400 line-through">M.R.P: {formatCurrency(p.mrp)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!loadingRecommended && recommended.length === 0 && (
                    <div className="text-slate-500 text-sm">No related products yet.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: cart total */}
            <div className="border rounded-xl p-6 bg-white shadow-sm sticky top-28">
              <h3 className="text-xl font-semibold mb-6">Cart Total</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-3 pt-3">
                  <span className="text-slate-600">Shipping:</span>
                  <span className="font-medium">{shipping === 0 ? "Free" : formatCurrency(shipping)}</span>
                </div>
                <div className="flex justify-between items-center pt-3">
                  <span className="text-slate-700 font-medium">Total:</span>
                  <span className="font-bold text-lg">{formatCurrency(total)}</span>
                </div>

                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-4 mt-4 transition"
                  onClick={() => {
                    alert("Proceed to checkout (demo)");
                  }}
                >
                  Proceed to checkout
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Cart;


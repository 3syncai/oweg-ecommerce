"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCartSummary } from "@/contexts/CartProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { writeCartQueryCache } from "@/hooks/useCart";
import {
  extractCartObject,
  type CartApiPayload,
  toMajorUnits,
  ZERO_DECIMAL_CURRENCIES,
} from "@/lib/cart-helpers";
import {
  notifyActionError,
  notifyCartUpdated,
  notifyCouponCheckoutOnly,
  notifyCouponInvalid,
  notifyQuantityUpdated,
  notifyRemoveItem,
} from "@/lib/notifications";
import { calculateStatewiseShipping } from "@/lib/shipping-rules";
import { warmRazorpayCheckout } from "@/lib/razorpay-warmup";
interface CartItemUI {
  id: string;
  name: string;
  price: number; // major unit (e.g., 350 -> 350)
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

/**
 * Try to find the first numeric amount from nested payloads.
 */
const extractFirstAmount = (...sources: Array<unknown>): number | undefined => {
  const seen = new WeakSet<object>();
  const dig = (value: unknown, depth: number): number | undefined => {
    if (value == null || depth > 6) return undefined;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof value === "object") {
      if (seen.has(value as object)) return undefined;
      seen.add(value as object);
      const obj = value as Record<string, unknown>;
      const nestedKeys = [
        "amount",
        "value",
        "calculated",
        "original",
        "incl_tax",
        "excl_tax",
        "calculated_amount",
        "original_amount",
        "presentment_amount",
        "raw_amount",
        "price",
      ];
      for (const key of nestedKeys) {
        if (obj[key] !== undefined) {
          const found = dig(obj[key], depth + 1);
          if (found !== undefined) return found;
        }
      }
      for (const val of Object.values(obj)) {
        const found = dig(val, depth + 1);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };

  for (const source of sources) {
    const result = dig(source, 0);
    if (result !== undefined) return result;
  }
  return undefined;
};

const DEFAULT_CURRENCY = "INR";

/**
 * Robust currency formatter that respects zero-decimal currencies.
 * Expects `value` in major units (e.g., 350 means ₹350).
 */
const formatCurrency = (
  value: number | null | undefined,
  currencyCode: string = DEFAULT_CURRENCY
): string => {
  const v = typeof value === "number" ? value : 0;
  const safeCurrency = currencyCode?.toUpperCase() || DEFAULT_CURRENCY;
  const zeroDecimals = ZERO_DECIMAL_CURRENCIES.has(safeCurrency);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: zeroDecimals ? 0 : Number.isInteger(v) ? 0 : 2,
      maximumFractionDigits: zeroDecimals ? 0 : 2,
    }).format(v);
  } catch {
    const digits = zeroDecimals ? 0 : 2;
    return `${safeCurrency} ${Number.isFinite(v) ? v.toFixed(digits) : String(v)}`;
  }
};

const REMOVE_ANIMATION_MS = 320;

/**
 * Convert a raw numeric 'amount' to major units using safer heuristics.
 *
 * IMPORTANT changes:
 * - We DO NOT divide moderately-large values like 1609 by 100.
 * - We only divide when it's extremely likely the value is in minor units (e.g., paise integers like 160900).
 */
function minorToMajorHeuristic(raw: number | undefined, currency?: string): number | undefined {
  if (raw === undefined || raw === null || !Number.isFinite(raw)) return undefined;
  const cur = (currency || DEFAULT_CURRENCY).toUpperCase();
  // If currency is zero-decimal, treat raw as already major.
  if (ZERO_DECIMAL_CURRENCIES.has(cur)) {
    return raw;
  }

  // If raw has decimal part -> it's already a major-unit number (e.g., 1516.94)
  if (Math.abs(raw % 1) > 1e-9) {
    return raw;
  }

  const abs = Math.abs(raw);

  // If value is extremely large (e.g., > 100,000) -> likely minor units (paise)
  // Example: 160900 -> 1609.00 after dividing by 100
  if (abs >= 100000) {
    return raw / 100;
  }

  // For moderate values (like 1609) assume it's already major (do NOT divide).
  return raw;
}

/**
 * Try to convert candidate raw numbers (from various fields) to a plausible major unit.
 * We intentionally prefer *discounted / presentment / line-total derived* values first.
 */
function resolvePreferredMajor(
  candidates: {
    derivedUnit?: number | undefined;
    presentment?: number | undefined;
    calculated?: number | undefined;
    unitRaw?: number | undefined;
    variantRaw?: number | undefined;
    productRaw?: number | undefined;
  },
  currency?: string
): number {
  // Order of preference:
  // 1) derivedUnit (line total / qty) — usually reflects discounts applied
  // 2) presentment / calculated fields from price_set (these often show final price)
  // 3) unitRaw (unit_price fields)
  // 4) variantRaw
  // 5) productRaw (product-level price)
  const tryOrder = [
    candidates.derivedUnit,
    candidates.presentment,
    candidates.calculated,
    candidates.unitRaw,
    candidates.variantRaw,
    candidates.productRaw,
  ];

  for (const cand of tryOrder) {
    if (typeof cand === "number" && Number.isFinite(cand)) {
      const maj = minorToMajorHeuristic(cand, currency);
      if (typeof maj === "number" && Number.isFinite(maj) && maj > 0) {
        return maj;
      }
      // If heuristic didn't decide, try toMajorUnits fallback (handles paise cases reliably)
      try {
        const fallback = toMajorUnits(cand, currency);
        if (Number.isFinite(fallback) && fallback > 0) return fallback;
      } catch {
        // ignore
      }
    }
  }

  // Last resort: return 0
  return 0;
}

/**
 * Map cart payload to UI items with robust heuristics.
 */
const mapCartPayloadToItems = (payload?: CartApiPayload): CartItemUI[] => {
  const cart = extractCartObject(payload);

  const region = (cart?.region as CartApiPayload | undefined) || undefined;
  const cartCurrencyCode =
    toStringOrUndefined(region?.currency_code) ||
    toStringOrUndefined((region?.currency as CartApiPayload | undefined)?.code) ||
    toStringOrUndefined(cart?.currency_code);

  const rawItems =
    (cart && ((cart.items as unknown) ?? (cart.line_items as unknown))) ?? [];

  const itemsArr = Array.isArray(rawItems) ? rawItems : [];

  return itemsArr.map((element) => {
    if (typeof element !== "object" || element === null) {
      return {
        id: String(Math.random()),
        name: "Item",
        price: 0,
        quantity: 1,
      };
    }
    const it = element as CartApiPayload;
    const name =
      toStringOrUndefined(it.title) ||
      toStringOrUndefined(it.product_title) ||
      toStringOrUndefined((it.variant as CartApiPayload)?.title) ||
      toStringOrUndefined(((it.variant as CartApiPayload)?.product as CartApiPayload)?.title) ||
      "Item";
    const image =
      toStringOrUndefined(it.thumbnail) ||
      toStringOrUndefined(it.image) ||
      toStringOrUndefined(((it.variant as CartApiPayload)?.product as CartApiPayload)?.thumbnail);

    const variant = (it.variant as CartApiPayload) || ({} as CartApiPayload);
    const product = (variant.product as CartApiPayload) || ({} as CartApiPayload);
    const productId =
      toStringOrUndefined(product.id) ||
      toStringOrUndefined(variant.product_id) ||
      toStringOrUndefined((it as CartApiPayload).product_id);
    const categoriesArr = Array.isArray((product as CartApiPayload)?.categories)
      ? ((product as CartApiPayload).categories as CartApiPayload[])
      : [];
    const categories = categoriesArr
      .map(
        (c) =>
          toStringOrUndefined((c as CartApiPayload).name) ||
          toStringOrUndefined((c as CartApiPayload).title) ||
          toStringOrUndefined((c as CartApiPayload).handle)
      )
      .filter(Boolean) as string[];
    const categoryHandles = categoriesArr
      .map((c) => toStringOrUndefined((c as CartApiPayload).handle))
      .filter(Boolean) as string[];
    const tagsArr = Array.isArray((product as CartApiPayload)?.tags)
      ? ((product as CartApiPayload).tags as CartApiPayload[])
      : [];
    const tags = tagsArr
      .map(
        (t) =>
          toStringOrUndefined((t as CartApiPayload).value) ||
          toStringOrUndefined((t as CartApiPayload).handle)
      )
      .filter(Boolean) as string[];
    const typeVal =
      toStringOrUndefined(((product as CartApiPayload)?.type as CartApiPayload)?.value) ||
      toStringOrUndefined(((product as CartApiPayload)?.type as CartApiPayload)?.handle) ||
      toStringOrUndefined((it as CartApiPayload).product_type) ||
      undefined;
    const collectionId =
      toStringOrUndefined((product as CartApiPayload)?.collection_id) ||
      toStringOrUndefined(((product as CartApiPayload)?.collection as CartApiPayload)?.id) ||
      undefined;

    const qty = Math.max(1, toNumber(it.quantity, 1));
    const currencyCode =
      toStringOrUndefined(it.currency_code) ||
      toStringOrUndefined(it.currency) ||
      cartCurrencyCode ||
      undefined;
    const normalizedCurrency = currencyCode?.toUpperCase();

    const priceSet = (it.price_set as CartApiPayload | undefined) || undefined;
    const rawUnitPrice = (it.raw_unit_price as CartApiPayload | undefined) || undefined;

    // unit/variant/product fields that may carry amounts
    const unitMinorRaw =
      extractFirstAmount(
        rawUnitPrice?.calculated,
        rawUnitPrice?.original,
        rawUnitPrice,
        it.unit_price,
        it.unit_price_incl_tax,
        it.unit_price_excl_tax,
        it.price,
        it.amount
      ) ?? undefined;

    // price_set presentment / calculated amounts (often final/presentment price after discounts)
    const presentmentAmt = extractFirstAmount(
      priceSet?.presentment_amount,
      priceSet?.calculated_amount,
      priceSet?.original_amount
    );

    const priceSetCalculated = extractFirstAmount(priceSet?.calculated_amount, priceSet?.original_amount);

    const lineTotalMinorRaw = extractFirstAmount(
      it.total,
      it.original_total,
      it.subtotal,
      it.original_subtotal,
      (it?.raw_total as CartApiPayload | undefined)?.calculated,
      (it?.raw_total as CartApiPayload | undefined)?.original
    );

    // If line total present (post-discount) derive per-unit from it
    const derivedUnitMinor =
      typeof lineTotalMinorRaw === "number" && qty > 0 ? lineTotalMinorRaw / qty : undefined;

    const variantPrices = Array.isArray(variant.prices)
      ? (variant.prices as CartApiPayload[])
      : [];
    const matchedVariantPrice = variantPrices.find((priceEntry) => {
      const priceCurrency = toStringOrUndefined(
        priceEntry.currency_code || priceEntry.region_currency_code
      );
      return priceCurrency?.toUpperCase() === normalizedCurrency;
    });
    const variantMinor = extractFirstAmount(
      matchedVariantPrice?.amount,
      matchedVariantPrice?.raw_amount,
      matchedVariantPrice?.price,
      variant.calculated_price,
      variant.original_price
    );

    // product-level price candidate (often used by product page)
    const productPriceCandidate = extractFirstAmount(
      product.price,
      product["mrp"],
      product["selling_price"],
      product["display_price"]
    );

    // Resolve final major price — prefer discounted / derived values
    const resolvedMajor = resolvePreferredMajor(
      {
        derivedUnit: derivedUnitMinor,
        presentment: presentmentAmt,
        calculated: priceSetCalculated,
        unitRaw: unitMinorRaw,
        variantRaw: variantMinor,
        productRaw: productPriceCandidate,
      },
      normalizedCurrency
    );

    // As a final fallback, if resolvedMajor is 0 but we have a numeric unitMinorRaw, try to use toMajorUnits
    let finalMajor = resolvedMajor;
    if ((!finalMajor || finalMajor === 0) && typeof unitMinorRaw === "number") {
      try {
        const fallback = toMajorUnits(unitMinorRaw, normalizedCurrency);
        if (Number.isFinite(fallback) && fallback > 0) finalMajor = fallback;
      } catch {
        // ignore
      }
    }

    const finalPrice = Number.isFinite(finalMajor) ? finalMajor : 0;

    return {
      id: String(it.id ?? Math.random().toString(36).slice(2, 9)),
      name: String(name),
      image: image ? String(image) : undefined,
      quantity: qty,
      price: Number(finalPrice),
      currency: normalizedCurrency,
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
};

const Cart: React.FC = () => {
  const { syncFromCartPayload } = useCartSummary();
  const { customer } = useAuth();
  const queryClient = useQueryClient();
  const [cartItems, setCartItems] = useState<CartItemUI[]>([]);
  const [couponCode, setCouponCode] = useState<string>("");
  const [mounted, setMounted] = useState<boolean>(false);
  const [removingIds, setRemovingIds] = useState<Record<string, boolean>>({});
  const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});

  // Note: the referral code is intentionally NOT auto-filled into the Coupon
  // input on the cart page anymore. A referral code is not a coupon, and
  // pre-filling it here confused customers. The /checkout page still fetches
  // and applies the referral code silently at order time
  // (see src/app/checkout/page.tsx :: fetchReferralCode), so attribution to
  // the referrer is unaffected.

  const deriveErrorMessage = useCallback((payload: unknown, fallback: string): string => {
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      const msg = record.error || record.message;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
    if (typeof payload === "string" && payload.trim()) return payload;
    return fallback;
  }, []);

  const applyCartPayload = useCallback(
    (payload?: CartApiPayload, options?: { delayMs?: number }) => {
      syncFromCartPayload(payload);
      writeCartQueryCache(queryClient, customer?.id, payload);
      const mapped = mapCartPayloadToItems(payload);
      const applyState = () => setCartItems(mapped);
      if (options?.delayMs) {
        window.setTimeout(applyState, options.delayMs);
      } else {
        applyState();
      }
    },
    [syncFromCartPayload, queryClient, customer?.id]
  );

  const rehydrateCart = useCallback(
    async (options?: { delayMs?: number }) => {
      try {
        // Get guest cart ID if available
        const guestCartId = typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null;

        const res = await fetch("/api/medusa/cart", {
          cache: "no-store",
          credentials: "include",
          headers: {
            ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
          },
        });
        if (!res.ok) return;
        const data = (await res.json()) as CartApiPayload;

        // Store guest cart ID if returned
        if (data.guestCartId && typeof window !== "undefined" && typeof data.guestCartId === "string") {
          localStorage.setItem("guest_cart_id", data.guestCartId);
        }

        applyCartPayload(data, options);
      } catch (err) {
        console.warn("Failed to refresh cart from server", err);
      }
    },
    [applyCartPayload]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCart(): Promise<void> {
      try {
        // Get guest cart ID if available
        const guestCartId = typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null;

        const res = await fetch("/api/medusa/cart", {
          cache: "no-store",
          credentials: "include",
          headers: {
            ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
          },
        });
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

        const data = (await res.json()) as CartApiPayload;

        // Store guest cart ID if returned
        if (data.guestCartId && typeof window !== "undefined" && typeof data.guestCartId === "string") {
          localStorage.setItem("guest_cart_id", data.guestCartId);
        }

        if (!cancelled) {
          applyCartPayload(data);
        }
      } catch {
        // ignore and keep demo if set
      }
    }

    loadCart();

    return () => {
      cancelled = true;
    };
  }, [applyCartPayload]);

  const updateQuantity = async (
    id: string,
    newQuantity: number,
    label = "Item"
  ): Promise<void> => {
    if (newQuantity < 1 || updatingIds[id]) return;
    setUpdatingIds((state) => ({ ...state, [id]: true }));
    try {
      // Get guest cart ID if available
      const guestCartId = typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null;

      const res = await fetch(`/api/medusa/cart/line-items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
        },
        body: JSON.stringify({ quantity: newQuantity }),
        credentials: "include",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = deriveErrorMessage(
          payload,
          "Could not update quantity. Please try again."
        );
        throw new Error(message);
      }
      notifyQuantityUpdated(label, newQuantity);
      applyCartPayload((payload as CartApiPayload) ?? undefined);
    } catch (err) {
      console.warn("Failed to update quantity", err);
      const message =
        err instanceof Error ? err.message : "Could not update quantity. Please try again.";
      notifyActionError("Unable to update quantity", message);
    } finally {
      setUpdatingIds((state) => {
        const copy = { ...state };
        delete copy[id];
        return copy;
      });
    }
  };

  const removeItem = async (item: CartItemUI): Promise<void> => {
    if (removingIds[item.id]) return;
    setRemovingIds((state) => ({ ...state, [item.id]: true }));
    try {
      // Get guest cart ID if available
      const guestCartId = typeof window !== "undefined" ? localStorage.getItem("guest_cart_id") : null;

      const res = await fetch(`/api/medusa/cart/line-items/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: {
          ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
        },
        credentials: "include",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = deriveErrorMessage(
          payload,
          "Unable to remove this item right now. Please try again."
        );
        throw new Error(message);
      }
      notifyRemoveItem(item.name);
      if (payload) {
        applyCartPayload((payload as CartApiPayload) ?? undefined, { delayMs: REMOVE_ANIMATION_MS });
      }
      await rehydrateCart({ delayMs: REMOVE_ANIMATION_MS });
      window.setTimeout(() => {
        setRemovingIds((state) => {
          const copy = { ...state };
          delete copy[item.id];
          return copy;
        });
      }, REMOVE_ANIMATION_MS);
    } catch (err) {
      console.warn("Failed to remove cart item", err);
      const message =
        err instanceof Error
          ? err.message
          : "Unable to remove this item right now. Please try again.";
      notifyActionError("Unable to remove item", message);
      setRemovingIds((state) => {
        const copy = { ...state };
        delete copy[item.id];
        return copy;
      });
    }
  };

  const handleApplyCoupon = (): void => {
    const trimmed = couponCode.trim();
    if (!trimmed) {
      notifyCouponInvalid();
      return;
    }
    const isDemoValid = trimmed.toUpperCase() === "OWEG10";
    if (isDemoValid) {
      notifyCouponCheckoutOnly(trimmed);
      if (typeof window !== "undefined") {
        window.location.href = "/checkout";
      }
    } else {
      notifyCouponInvalid();
    }
  };

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = calculateStatewiseShipping(subtotal);
  const total = subtotal + shipping;
  const activeCurrency = cartItems[0]?.currency ?? DEFAULT_CURRENCY;

  useEffect(() => {
    if (cartItems.length > 0) {
      warmRazorpayCheckout();
    }
  }, [cartItems.length]);

  // Recommended products from cart item relations (type/tag/category)
  type UIProduct = {
    id: string | number;
    name: string;
    image: string;
    price: number;
    mrp: number;
    discount: number;
    variant_id?: string;
    handle?: string;
  };
  const [recommended, setRecommended] = useState<UIProduct[]>([]);
  const [loadingRecommended, setLoadingRecommended] = useState(false);
  const [checkoutExpanded, setCheckoutExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const slugifyHandle = (value: string | undefined | null): string | undefined => {
      if (!value) return undefined;
      const slug = value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
      return slug || undefined;
    };

    async function loadRelated() {
      if (!cartItems.length) {
        setRecommended([]);
        return;
      }
      setLoadingRecommended(true);
      try {
        // const typeSet = new Set<string>();
        const excludeIds = new Set<string | undefined>();
        const perItemContexts: Array<Array<{ kind: "tag" | "category"; v: string }>> = cartItems.map(() => []);
        const productIndexById = new Map<string, number>();
        const fallbackDetailRequests: Array<{ productId: string; index: number }> = [];
        cartItems.forEach((it, index) => {
          const contexts = perItemContexts[index];
          const productId = it.meta?.productId;
          if (productId) productIndexById.set(productId, index);
          let hasContext = false;
          // if (it.meta?.type) typeSet.add(it.meta.type);
          for (const t of it.meta?.tags || []) {
            const cleanTag = t?.trim();
            if (cleanTag) {
              contexts.push({ kind: "tag", v: cleanTag });
              hasContext = true;
            }
          }
          const handles = Array.isArray(it.meta?.categoryHandles)
            ? it.meta?.categoryHandles
            : [];
          const categories = Array.isArray(it.meta?.categories)
            ? it.meta?.categories
            : [];
          handles.forEach((handle) => {
            const slug = slugifyHandle(handle);
            if (slug) {
              contexts.push({ kind: "category", v: slug });
              hasContext = true;
            }
          });
          if (!handles.length && categories.length) {
            categories.forEach((name) => {
              const slug = slugifyHandle(name);
              if (slug) {
                contexts.push({ kind: "category", v: slug });
                hasContext = true;
              }
            });
          }
          excludeIds.add(it.meta?.productId);
          if (!hasContext && productId) {
            fallbackDetailRequests.push({ productId, index });
          }
        });

        if (fallbackDetailRequests.length) {
          const detailResults = await Promise.all(
            fallbackDetailRequests.map(async ({ productId, index }) => {
              try {
                const res = await fetch(`/api/medusa/products/${encodeURIComponent(productId)}`, {
                  cache: "no-store",
                });
                if (!res.ok) {
                  return { product: null as { tags?: string[]; categories?: Array<{ handle?: string | null; title?: string | null; name?: string | null }> } | null, index };
                }
                const data = (await res.json()) as {
                  product?: { tags?: string[]; categories?: Array<{ handle?: string | null; title?: string | null; name?: string | null }> };
                };
                return { product: data.product || null, index };
              } catch {
                return { product: null, index };
              }
            })
          );
          detailResults.forEach(({ product, index }) => {
            if (!product) return;
            const contexts = perItemContexts[index] || [];
            (product.tags || []).forEach((tag: string | undefined) => {
              const cleanTag = tag?.trim();
              if (cleanTag) contexts.push({ kind: "tag", v: cleanTag });
            });
            (product.categories || []).forEach((cat: { handle?: string | null; title?: string | null; name?: string | null }) => {
              const slug = slugifyHandle(cat.handle) || slugifyHandle(cat.title || cat.name);
              if (slug) contexts.push({ kind: "category", v: slug });
            });
          });
        }

        const picks: Array<{ kind: "tag" | "category"; v: string }> = [];
        const seenOrderedKeys = new Set<string>();
        const perItemQueues = perItemContexts.map((ctxs) => [...ctxs]);
        let madeProgress = true;
        const PICK_LIMIT = 4;
        while (madeProgress && picks.length < PICK_LIMIT) {
          madeProgress = false;
          for (const queue of perItemQueues) {
            while (queue.length) {
              const ctx = queue.shift()!;
              const key = `${ctx.kind}:${ctx.v}`;
              if (seenOrderedKeys.has(key)) {
                continue;
              }
              seenOrderedKeys.add(key);
              picks.push(ctx);
              madeProgress = true;
              break;
            }
          }
        }

        if (!picks.length) {
          setRecommended([]);
          return;
        }

        const contexts = picks.map((p) => `${p.kind}:${p.v}`).join(",");
        const exclude = Array.from(excludeIds)
          .filter(Boolean)
          .map(String)
          .join(",");
        const params = new URLSearchParams({
          contexts,
          exclude,
          limit: "12",
        });
        const r = await fetch(`/api/medusa/cart-recommendations?${params.toString()}`);
        if (!r.ok) {
          if (!cancelled) setRecommended([]);
          return;
        }
        const data = (await r.json()) as { products?: UIProduct[] };
        if (!cancelled) setRecommended((data.products || []).slice(0, 9));
      } finally {
        if (!cancelled) setLoadingRecommended(false);
      }
    }
    loadRelated();
    return () => {
      cancelled = true;
    };
  }, [cartItems]);

  const cartCard =
    "rounded-2xl border border-slate-200/50 bg-white/95 shadow-[0_10px_40px_-12px_rgba(44,52,47,0.12)]";
  const cartField =
    "h-11 rounded-xl border-slate-200/90 bg-white shadow-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-[var(--oweg-green)] focus-visible:ring-[3px] focus-visible:ring-[var(--oweg-green)]/20";
  const cartCta =
    "bg-[var(--oweg-green)] hover:bg-[var(--oweg-green-dark)] text-white font-semibold rounded-xl shadow-md shadow-[var(--oweg-green)]/20 transition-all duration-200 active:scale-[0.99]";
  const cartOutline =
    "rounded-xl border-slate-200/80 bg-white text-[#2c342f] hover:border-[var(--oweg-green)]/50 hover:bg-[#f2f9ef] hover:text-[var(--oweg-green-dark)] transition-all duration-200";
  const cartStepper =
    "cart-stepper flex items-center overflow-hidden rounded-xl border border-slate-200/80 bg-white";

  return (
    <div className="cart-ui oweg-page min-h-screen flex flex-col text-[#2c342f]">
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8 md:py-10 pb-44 md:pb-16">
          <div className="flex items-center gap-3 mb-6 md:mb-8">
            <Link href="/" className="text-sm text-slate-500 hover:text-[#2c342f] transition">
              Home
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium bg-[#f0f5ef] text-[var(--oweg-green-dark)] px-3 py-1 rounded-full">
              Cart
            </span>
          </div>

          <div className="mb-7 md:mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--oweg-green-dark)] mb-2">
              Your bag
            </p>
            <h1 className="text-3xl md:text-[2rem] font-bold text-[#2c342f]">Cart</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Review items, apply a coupon, then proceed to checkout.
            </p>
          </div>

          <div className="mb-8 space-y-3">
            <div className="hidden md:grid grid-cols-12 gap-4 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="col-span-6">Product</div>
              <div className="col-span-2">Price</div>
              <div className="col-span-2 text-center">Quantity</div>
              <div className="col-span-2 text-right">Subtotal</div>
            </div>

            {cartItems.length === 0 && (
              <div className={`${cartCard} px-6 py-12 text-center text-slate-500`}>
                Your cart is empty.
              </div>
            )}
            {cartItems.map((item) => {
              const isRemoving = !!removingIds[item.id];
              const isUpdating = !!updatingIds[item.id];
              const controlsDisabled = isRemoving || isUpdating;
              return (
                <div
                  key={item.id}
                  className={`cart-line-card ${cartCard} flex flex-col md:flex-row md:items-center gap-4 md:gap-6 p-4 md:px-5 md:py-5 transition-all transform ${
                    mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
                  } ${isRemoving ? "opacity-0 scale-95" : ""}`}
                  style={{ transitionDuration: "320ms" }}
                >
                  <div className="flex items-center gap-3 md:gap-4 w-full md:w-3/5 min-w-0">
                    <button
                      onClick={() => removeItem(item)}
                      title="Remove item"
                      className={`shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl p-2 transition ${
                        isRemoving ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      aria-label={`Remove ${item.name}`}
                      type="button"
                      disabled={isRemoving}
                    >
                      <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                    </button>

                    <div className="w-[72px] h-[72px] flex-shrink-0 rounded-xl overflow-hidden bg-[#f0f5ef] flex items-center justify-center">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          width={80}
                          height={80}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-xs text-slate-400">No image</div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm md:text-[15px] font-semibold text-[#2c342f] line-clamp-2">
                        {item.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 hidden md:block">
                        SKU · {item.id}
                      </div>
                      <div className="md:hidden mt-1 text-sm font-medium text-slate-600">
                        {formatCurrency(item.price, item.currency || activeCurrency)}
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:flex md:w-1/6 items-center justify-start">
                    <div className="text-sm md:text-base font-medium text-[#2c342f]">
                      {formatCurrency(item.price, item.currency || activeCurrency)}
                    </div>
                  </div>

                  <div className="hidden md:flex md:w-1/6 items-center justify-center">
                    <div className={cartStepper}>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1, item.name)}
                        aria-label="Decrease"
                        className={`px-3 py-2.5 text-slate-500 transition ${
                          controlsDisabled ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                        type="button"
                        disabled={controlsDisabled}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="px-3 text-sm font-semibold w-10 text-center text-[#2c342f]">
                        {item.quantity}
                      </div>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1, item.name)}
                        aria-label="Increase"
                        className={`px-3 py-2.5 text-slate-500 transition ${
                          controlsDisabled ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                        type="button"
                        disabled={controlsDisabled}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="hidden md:flex md:w-1/6 items-center justify-end">
                    <div className="text-sm md:text-base font-bold text-[#2c342f]">
                      {formatCurrency(item.price * item.quantity, item.currency || activeCurrency)}
                    </div>
                  </div>

                  <div className="w-full md:hidden border-t border-slate-100 pt-3 space-y-3 text-sm text-slate-600">
                    <div className="flex items-center justify-between">
                      <span>Quantity</span>
                      <div className={cartStepper}>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1, item.name)}
                          aria-label="Decrease"
                          className={`px-3 py-2 text-slate-500 transition ${
                            controlsDisabled ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                          type="button"
                          disabled={controlsDisabled}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="px-3 text-sm font-semibold w-10 text-center text-[#2c342f]">
                          {item.quantity}
                        </div>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1, item.name)}
                          aria-label="Increase"
                          className={`px-3 py-2 text-slate-500 transition ${
                            controlsDisabled ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                          type="button"
                          disabled={controlsDisabled}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-bold text-[#2c342f]">
                        {formatCurrency(item.price * item.quantity, item.currency || activeCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-12 pb-40 md:pb-0 items-start">
            <div className="space-y-6 order-2 md:order-none">
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className={`px-5 py-3 h-11 ${cartOutline}`}>
                  <Link href="/">Return to shop</Link>
                </Button>
                <Button
                  variant="outline"
                  className={`px-5 py-3 h-11 ${cartOutline}`}
                  onClick={notifyCartUpdated}
                >
                  Update cart
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <Input
                  type="text"
                  placeholder="Coupon code"
                  value={couponCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCouponCode(e.target.value)}
                  className={`flex-1 ${cartField}`}
                />
                <Button className={`${cartCta} px-6 h-11 shrink-0`} onClick={handleApplyCoupon}>
                  Apply coupon
                </Button>
              </div>

              <div className={`${cartCard} p-5 md:p-6 space-y-4`}>
                <h2 className="text-lg font-semibold text-[#2c342f]">
                  Customers Who Brought Items in Your Recent History Also Bought
                </h2>
                {loadingRecommended && (
                  <div className="text-sm text-slate-500">Finding related products…</div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                  {recommended.map((p) => {
                    const slug = encodeURIComponent(String(p.handle || p.id));
                    const href = `/productDetail/${slug}?id=${encodeURIComponent(String(p.id))}`;
                    return (
                      <Link
                        key={p.id}
                        href={href}
                        className="rounded-xl border border-slate-200/60 overflow-hidden bg-white hover:border-[var(--oweg-green)]/40 hover:shadow-[0_12px_32px_-12px_rgba(44,52,47,0.14)] transition-all duration-200"
                      >
                        <div className="relative aspect-[3/2] bg-[#f7faf5]">
                          <Image
                            src={p.image}
                            alt={p.name}
                            width={300}
                            height={200}
                            className="w-full h-full object-contain p-2"
                          />
                          <div className="absolute top-2.5 left-2.5 flex gap-2">
                            <span className="bg-[var(--oweg-green-dark)] text-white px-2 py-0.5 rounded-full text-[11px] font-semibold">
                              {p.discount}% off
                            </span>
                          </div>
                        </div>
                        <div className="p-3 space-y-1">
                          <p className="text-sm font-medium text-[#2c342f] line-clamp-2">{p.name}</p>
                          <div className="flex items-baseline gap-2">
                            <div className="text-base font-bold">{formatCurrency(p.price)}</div>
                            <div className="text-xs text-slate-400 line-through">{formatCurrency(p.mrp)}</div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                {!loadingRecommended && recommended.length === 0 && (
                  <div className="text-slate-500 text-sm">No related products yet.</div>
                )}
              </div>
            </div>

            <div
              className={`cart-summary-panel order-1 md:order-none fixed md:sticky md:top-28 bottom-24 md:bottom-auto left-0 right-0 md:left-auto md:right-auto md:relative z-[500] md:z-auto rounded-t-2xl md:rounded-2xl border border-slate-200/50 bg-white/95 md:bg-white/95 shadow-[0_10px_40px_-12px_rgba(44,52,47,0.16)] md:shadow-[0_10px_40px_-12px_rgba(44,52,47,0.12)]`}
            >
              <div className="md:hidden">
                <button
                  type="button"
                  onClick={() => setCheckoutExpanded(!checkoutExpanded)}
                  className="w-full flex items-center justify-between p-3.5 active:bg-[#f7faf5] transition-colors"
                  aria-label={checkoutExpanded ? "Collapse cart summary" : "Expand cart summary"}
                  aria-expanded={checkoutExpanded}
                >
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-sm font-semibold text-[#2c342f]">Cart Total</h3>
                    <span className="text-sm font-bold text-[var(--oweg-green-dark)]">
                      {formatCurrency(total, activeCurrency)}
                    </span>
                  </div>
                  {checkoutExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  )}
                </button>
              </div>

              <h3 className="hidden md:block text-xl font-semibold text-[#2c342f] p-6 pb-0">
                Cart Total
              </h3>

              <div
                className={`transition-all duration-300 ease-in-out ${
                  checkoutExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"
                } md:max-h-none md:opacity-100`}
              >
                <div className="px-4 md:px-6 pt-0 pb-3 md:pt-6 md:pb-4 space-y-3 md:space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2.5 md:pb-3 pt-3 md:pt-0">
                    <span className="text-xs md:text-sm text-slate-500">Subtotal</span>
                    <span className="text-xs md:text-sm font-semibold text-[#2c342f]">
                      {formatCurrency(subtotal, activeCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2.5 md:pb-3 pt-1 md:pt-0">
                    <span className="text-xs md:text-sm text-slate-500">Shipping</span>
                    <span className="text-xs md:text-sm font-semibold text-[#2c342f]">
                      {shipping === 0 ? "Free" : formatCurrency(shipping, activeCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 md:pt-1">
                    <span className="text-sm md:text-base font-semibold text-[#2c342f]">Total</span>
                    <span className="text-lg md:text-xl font-bold text-[#2c342f]">
                      {formatCurrency(total, activeCurrency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-4 md:px-6 pb-4 md:pb-6 pt-0">
                {cartItems.length === 0 ? (
                  <Button
                    className={`w-full h-11 md:h-12 text-sm md:text-base ${cartCta}`}
                    disabled
                    aria-disabled="true"
                  >
                    Proceed to checkout
                  </Button>
                ) : (
                  <Button asChild className={`w-full h-11 md:h-12 text-sm md:text-base ${cartCta}`}>
                    <Link href="/checkout">Proceed to checkout</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Cart;

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthProvider";
import { useShippingOptions } from "@/hooks/use-shipping-options";

type CartItem = {
  id: string;
  title: string;
  quantity: number;
  unit_price: number;
  thumbnail?: string;
};

type CartResponse = {
  cart?: {
    id: string;
    region_id?: string;
    currency_code?: string;
    total?: number;
    shipping_total?: number;
    items?: CartItem[];
  };
};

type DraftOrderResponse = {
  medusaOrderId: string;
  total: number;
  currency_code: string;
  cartId: string;
};

const RAZORPAY_SUCCESS = process.env.NEXT_PUBLIC_PAYMENT_SUCCESS_URL || "/order/success";
const RAZORPAY_FAILED = process.env.NEXT_PUBLIC_PAYMENT_FAILED_URL || "/order/failed";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
});


const isRazorpayTest =
  process.env.NEXT_PUBLIC_RAZORPAY_TESTMODE === "true" ||
  process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; close?: () => void };
  }
}

function CheckoutPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { customer, setCustomer, refresh } = useAuth();
  const isBuyNow = searchParams?.get("buyNow") === "1";
  const variantFromQuery =
    searchParams?.get("variant_id") ||
    searchParams?.get("variantId") ||
    searchParams?.get("variant") ||
    undefined;
  const qtyFromQuery = searchParams?.get("qty") || searchParams?.get("quantity") || undefined;
  const priceFromQuery = searchParams?.get("price");
  const [guestCartId, setGuestCartId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartResponse["cart"] | null>(null);
  const [buyNowItem, setBuyNowItem] = useState<{
    variantId: string;
    quantity: number;
    title?: string;
    thumbnail?: string;
    priceMinor?: number;
  } | null>(null);
  const [loadingCart, setLoadingCart] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"razorpay" | "cod">("razorpay");
  const [shippingMethod, setShippingMethod] = useState<string | null>(null);
  
  const { options: shippingMethods, isLoading: shippingMethodsLoading, refetch: refetchShipping } = useShippingOptions(cart?.id);

  useEffect(() => {
    if (shippingMethods.length > 0 && !shippingMethod) {
        setShippingMethod(shippingMethods[0].id)
    }
  }, [shippingMethods, shippingMethod])

  const [referralCode, setReferralCode] = useState("");
  const [billingSame, setBillingSame] = useState(true);
  const [shipping, setShipping] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    postalCode: "",
    countryCode: "IN",
  });
  const [billing, setBilling] = useState({ ...shipping });

  // Prefill email and referral code from logged-in customer
  useEffect(() => {
    if (customer?.email) {
      setShipping((prev) => (prev.email ? prev : { ...prev, email: customer.email as string }));
      setBilling((prev) => (prev.email ? prev : { ...prev, email: customer.email as string }));
    }
    const meta = (customer?.metadata || {}) as { referral_code?: string; referral?: string; referralCode?: string };
    const refCode = meta.referral_code || meta.referral || meta.referralCode;
    if (refCode && !referralCode) {
      setReferralCode(refCode);
    }
  }, [customer, referralCode]);

  useEffect(() => {
    if (cart?.id) {
       refetchShipping();
    }
  }, [cart?.id, shipping.city, shipping.postalCode, refetchShipping])

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("guest_cart_id");
    if (stored) setGuestCartId(stored);

    const buyNowRaw = localStorage.getItem("buy_now_item");
    if (buyNowRaw) {
      try {
        const parsed = JSON.parse(buyNowRaw);
        if (parsed?.variantId && parsed?.quantity) {
          setBuyNowItem({
            variantId: String(parsed.variantId),
            quantity: Math.max(1, Number(parsed.quantity) || 1),
            title: parsed.title,
            thumbnail: parsed.thumbnail,
            priceMinor: typeof parsed.priceMinor === "number" ? parsed.priceMinor : undefined,
          });
          return;
        }
      } catch {
        // ignore parse error
      }
    }

    if (variantFromQuery) {
      // fallback when localStorage blocked or cleared
      // priceFromQuery is likely in Major units (e.g. 186), convert to Minor (18600)
      setBuyNowItem({
        variantId: variantFromQuery,
        quantity: Math.max(1, Number(qtyFromQuery) || 1),
        priceMinor: priceFromQuery ? Number(priceFromQuery) : undefined,
      });
    }
  }, [variantFromQuery, qtyFromQuery, priceFromQuery]);

  useEffect(() => {
    const loadCart = async () => {
      try {
        setLoadingCart(true);
        const fallbackBuyNow =
          buyNowItem ||
          (isBuyNow && variantFromQuery
            ? {
                variantId: variantFromQuery,
                quantity: Math.max(1, Number(qtyFromQuery) || 1),
                title: "Selected item",
                priceMinor: priceFromQuery ? Number(priceFromQuery) : undefined,
              }
            : null);

        if (isBuyNow && fallbackBuyNow) {
          // For buy-now, show a lightweight summary; totals are recalculated server-side on submit
          setCart({
            id: "buy-now",
            currency_code: "INR",
            items: [
              {
                id: fallbackBuyNow.variantId,
                title: fallbackBuyNow.title || "Selected item",
                quantity: fallbackBuyNow.quantity,
                unit_price: fallbackBuyNow.priceMinor ?? 0,
                thumbnail: fallbackBuyNow.thumbnail,
              },
            ],
          });
          return;
        }
        const res = await fetch("/api/medusa/cart", {
          cache: "no-store",
          headers: {
            ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
          },
        });
        if (!res.ok) throw new Error("Cart unavailable");
        const data = (await res.json()) as CartResponse;
        if (data.cart) setCart(data.cart);
      } catch (err) {
        console.error(err);
        toast.error("Unable to load cart");
      } finally {
        setLoadingCart(false);
      }
    };
    void loadCart();
  }, [guestCartId, buyNowItem, isBuyNow, variantFromQuery, qtyFromQuery, priceFromQuery]);

  const clientTotals = useMemo(() => {
    const itemsTotal =
      cart?.items?.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0) || 0;
    
    const selectedMethod = shippingMethods.find((s) => s.id === shippingMethod);
    const shippingAmountMinor = selectedMethod?.amount || 0;
    
    return {
      subtotal: itemsTotal,
      shipping: shippingAmountMinor,
      total: itemsTotal + shippingAmountMinor,
    };
  }, [cart?.items, shippingMethod, shippingMethods]);

  const handleShippingSelect = async (optionId: string) => {
    setShippingMethod(optionId)
    if (!cart?.id || cart.id === "buy-now") return
    
    try {
        await fetch("/api/medusa/shipping-methods", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cartId: cart.id, optionId })
        })
    } catch (e) {
        console.error("Failed to select shipping method", e)
        toast.error("Failed to update shipping method")
    }
  }

  const [serverTotals, setServerTotals] = useState<{
    subtotal: number;
    shipping: number;
    total: number;
  } | null>(null);
  const [totalsLoading, setTotalsLoading] = useState(false);
  const [totalWarning, setTotalWarning] = useState<string | null>(null);

  useEffect(() => {
    const hasCartItems = (cart?.items?.length || 0) > 0;
    const hasBuyNowItem = isBuyNow && (buyNowItem || variantFromQuery);
    
    // Explicitly reset server totals if we have no valid items to checkout
    if (!hasCartItems && !hasBuyNowItem) {
      setServerTotals(null);
      setTotalWarning(null);
      return;
    }

    const safeNumber = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const normalizeTotals = (data: unknown) => ({
      subtotal: safeNumber((data as Record<string, unknown>)?.subtotal),
      shipping: safeNumber((data as Record<string, unknown>)?.shipping),
      total: safeNumber((data as Record<string, unknown>)?.total),
    });

    const fetchTotals = async () => {
      const fallbackBuyNow =
        buyNowItem ||
        (isBuyNow && variantFromQuery
          ? {
              variantId: variantFromQuery,
              quantity: Math.max(1, Number(qtyFromQuery) || 1),
              priceMinor: priceFromQuery ? Number(priceFromQuery) : undefined,
            }
          : null);

      const selectedMethod = shippingMethods.find((s) => s.id === shippingMethod);

      try {
        setTotalsLoading(true);
        setTotalWarning(null);
        const res = await fetch("/api/checkout/order-summary", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
          },
          body: JSON.stringify({
            mode: isBuyNow ? "buy_now" : "cart",
            cartId: cart?.id,
            guestCartId,
            shippingMethod,
            shippingPrice: selectedMethod?.amount, // Pass explicit price (Major units)
            itemsOverride: isBuyNow && fallbackBuyNow
              ? [
                  {
                    variant_id: fallbackBuyNow.variantId,
                    quantity: fallbackBuyNow.quantity,
                    price_minor: fallbackBuyNow.priceMinor,
                  },
                ]
              : undefined,
          }),
        });

        if (!res.ok) throw new Error("order summary unavailable");
        const data = await res.json();
        const next = normalizeTotals(data);
        setServerTotals(next);
        const delta = Math.abs(next.total - clientTotals.total);
        if (next.total > 0 && clientTotals.total > 0 && delta >= 100) {
          setTotalWarning("Order total updated based on server pricing. Please review before paying.");
        }
      } catch (err) {
        console.warn("order-summary fallback to client totals", err);
        setServerTotals(null);
      } finally {
        setTotalsLoading(false);
      }
    };

    void fetchTotals();
  }, [
    cart?.id,
    cart?.items,
    shippingMethod,
    guestCartId,
    isBuyNow,
    buyNowItem,
    variantFromQuery,
    qtyFromQuery,
    priceFromQuery,
    clientTotals.total,
  ]);

  const formatInr = (value: number) => INR.format(value);
  const formatMajor = (minorObj: number) => INR.format(minorObj);

  const ensureRazorpay = () =>
    new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined") return reject(new Error("No window"));
      if (window.Razorpay) return resolve();
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
      document.body.appendChild(script);
    });

  const createDraftOrder = async () => {
    const fallbackBuyNow =
      buyNowItem ||
      (isBuyNow && variantFromQuery
        ? {
            variantId: variantFromQuery,
            quantity: Math.max(1, Number(qtyFromQuery) || 1),
            priceMinor: priceFromQuery ? Number(priceFromQuery) : undefined,
          }
        : null);

    // GUARD: If in Buy Now mode but item details are missing, block checkout
    if (isBuyNow && !fallbackBuyNow) {
        toast.error("Buy Now session expired. Please select the product again.");
        // Optional: Redirect back to home or history
        router.push("/");
        throw new Error("Buy Now session expired");
    }

    const selectedOption = shippingMethods.find((s) => s.id === shippingMethod);
    const shippingPriceMajor = selectedOption && typeof selectedOption.amount === 'number' ? selectedOption.amount / 100 : 0;

    const requestPayload = {
        shipping,
        billing,
        billingSameAsShipping: billingSame,
        shippingMethod,
        shippingPrice: shippingPriceMajor,
        shippingMethodName: selectedOption?.name,
        referralCode,
        paymentMethod,
        mode: isBuyNow ? "buy_now" : "cart",
        itemsOverride: isBuyNow && fallbackBuyNow
          ? [
              {
                variant_id: fallbackBuyNow.variantId,
                quantity: fallbackBuyNow.quantity,
                price_minor: fallbackBuyNow.priceMinor,
              },
            ]
          : undefined,
    };
    
    console.log('🛒 [Frontend Debug] createDraftOrder Payload:', requestPayload);

    const res = await fetch("/api/checkout/draft-order", {
      method: "POST",
      headers: {
        "content-type": "application/json",
         ...(guestCartId ? { "x-guest-cart-id": guestCartId } : {}),
      },
      body: JSON.stringify(requestPayload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = typeof err.error === "string" ? err.error : null;
      const normalized = message ? message.toLowerCase() : "";
      if (normalized.includes("insufficient_inventory") || normalized.includes("does not have the required inventory")) {
        throw new Error("One or more items are out of stock. Please update quantity or remove the item.");
      }
      throw new Error(message || "Failed to start checkout");
    }
    return (await res.json()) as DraftOrderResponse;
  };

  const handleCod = async (draft: DraftOrderResponse) => {
    const res = await fetch("/api/checkout/cod", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ medusaOrderId: draft.medusaOrderId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "COD confirmation failed");
    }
    router.push(`${RAZORPAY_SUCCESS}?orderId=${encodeURIComponent(draft.medusaOrderId)}`);
  };

  const handleRazorpay = async (draft: DraftOrderResponse) => {
    await ensureRazorpay();
    const createRes = await fetch("/api/create-razorpay-order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ medusaOrderId: draft.medusaOrderId, amount: draft.total }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.error || "Unable to create payment");
    }
    const createData = await createRes.json();

    // DB now stores Rupees (Major Units). Razorpay expects Paise (Minor Units).
    // Convert: Rupees * 100 = Paise
    const amountMinor = Math.round(draft.total * 100);

    const payload = {
      key: createData.key,
      amount: amountMinor,
      currency: createData.currency,
      orderId: createData.orderId,
    };

    console.log("💳 [Razorpay Init] Converting Rupees to Paise:", { totalRupees: draft.total, amountPaise: amountMinor });

    const Razorpay = window.Razorpay;
    if (!Razorpay) throw new Error("Razorpay SDK unavailable");
    
    const rzp = new Razorpay({
      key: payload.key,
      amount: payload.amount,
      currency: payload.currency,
      name: "OWEG",
      description: "Order Payment",
      order_id: payload.orderId,
      method: ["upi", "card", "netbanking", "wallet"],
      prefill: {
        name: `${shipping.firstName} ${shipping.lastName}`.trim(),
        email: shipping.email,
        contact: shipping.phone,
      },
      // Highlight UPI and keep other options available
      config: {
        display: {
          blocks: {
            upi: {
              name: "UPI",
              instruments: [{ method: "upi" }],
            },
            wallet: {
              name: "Wallets",
              instruments: [{ method: "wallet" }],
            },
          },
          sequence: ["upi", "wallet", "card", "netbanking"],
          preferences: {
            show_default_blocks: true,
          },
        },
        upi: {
          flow: "collect",
        },
        wallet: {
          enabled: true,
        },
      },
      notes: {
        medusa_order_id: draft.medusaOrderId,
      },
      handler: async function (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) {
        toast.info("Payment captured. Finalizing order...");
        try {
          const confirmRes = await fetch("/api/checkout/razorpay/confirm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              medusaOrderId: draft.medusaOrderId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              amount_minor: payload.amount,
              currency: payload.currency,
            }),
          });
          if (!confirmRes.ok) {
            console.error("razorpay confirm returned non-OK", { status: confirmRes.status });
            toast.warning("Payment received. Order confirmation in progress...");
          }
        } catch (err) {
          console.error("razorpay confirm failed", err);
          toast.warning("Payment received. Order confirmation in progress...");
        }
        router.push(`${RAZORPAY_SUCCESS}?orderId=${encodeURIComponent(draft.medusaOrderId)}`);
      },
      modal: {
        ondismiss: function () {
          router.push(`${RAZORPAY_FAILED}?orderId=${encodeURIComponent(draft.medusaOrderId)}`);
        },
      },
    });
    rzp.open();
  };

  const performCheckout = async () => {
    if (processing) return;
    // Validate presence of items before hitting backend
    const hasCartItems = (cart?.items?.length || 0) > 0;
    const hasBuyNowItem = isBuyNow && (buyNowItem || variantFromQuery);
    const allowCheckout = isBuyNow ? hasBuyNowItem : hasCartItems;
    if (!allowCheckout) {
      toast.error("Cart is empty. Please add an item before checkout.");
      return;
    }
    setProcessing(true);
    try {
      if (isBuyNow && !buyNowItem) {
        throw new Error("Selected item unavailable. Please try again.");
      }

      const draft = await createDraftOrder();
      if (paymentMethod === "cod") {
        await handleCod(draft);
      } else {
        await handleRazorpay(draft);
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) {
      setLoginModalOpen(true);
      return;
    }
    await performCheckout();
  };

  const cartItems = cart?.items || [];

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!loginEmail || !loginPassword) {
      setLoginError("Enter email and password to continue.");
      return;
    }
    try {
      setLoginBusy(true);
      const res = await fetch("/api/medusa/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "Cache-Control": "no-store" },
        credentials: "include",
        body: JSON.stringify({ identifier: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || "Login failed. Check your details.";
        setLoginError(msg);
        toast.error(msg);
        return;
      }
      if (data?.customer) {
        setCustomer(data.customer);
      } else {
        await refresh();
      }
      toast.success("Logged in. Continue checkout.");
      setLoginModalOpen(false);
      setLoginPassword("");
      await performCheckout();
    } catch (err) {
      console.error(err);
      setLoginError("Login failed. Please try again.");
    } finally {
      setLoginBusy(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-10 pb-20">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">Checkout</h1>
        <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Shipping details</h2>
                <span className="text-xs text-slate-500">All fields required</span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  required
                  placeholder="First name"
                  value={shipping.firstName}
                  onChange={(e) => setShipping({ ...shipping, firstName: e.target.value })}
                />
                <Input
                  placeholder="Last name"
                  value={shipping.lastName}
                  onChange={(e) => setShipping({ ...shipping, lastName: e.target.value })}
                />
                <Input
                  required
                  type="email"
                  placeholder="Email"
                  value={shipping.email}
                  onChange={(e) => setShipping({ ...shipping, email: e.target.value })}
                  readOnly={!!customer?.email}
                  className={customer?.email ? "bg-gray-100 cursor-not-allowed" : undefined}
                  aria-readonly={!!customer?.email}
                />
                <Input
                  required
                  placeholder="Phone"
                  value={shipping.phone}
                  onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                />
                <Input
                  required
                  placeholder="Address line 1"
                  className="md:col-span-2"
                  value={shipping.address1}
                  onChange={(e) => setShipping({ ...shipping, address1: e.target.value })}
                />
                <Input
                  placeholder="Address line 2"
                  className="md:col-span-2"
                  value={shipping.address2}
                  onChange={(e) => setShipping({ ...shipping, address2: e.target.value })}
                />
                <Input
                  required
                  placeholder="City"
                  value={shipping.city}
                  onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
                />
                <Input
                  required
                  placeholder="State"
                  value={shipping.state}
                  onChange={(e) => setShipping({ ...shipping, state: e.target.value })}
                />
                <Input
                  required
                  placeholder="PIN code"
                  value={shipping.postalCode}
                  onChange={(e) => setShipping({ ...shipping, postalCode: e.target.value })}
                />
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Billing details</h2>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={billingSame}
                    onChange={(e) => setBillingSame(e.target.checked)}
                  />
                  Same as shipping
                </label>
              </div>
              {!billingSame && (
                <div className="grid md:grid-cols-2 gap-4">
                  <Input
                    required
                    placeholder="First name"
                    value={billing.firstName}
                    onChange={(e) => setBilling({ ...billing, firstName: e.target.value })}
                  />
                  <Input
                    placeholder="Last name"
                    value={billing.lastName}
                    onChange={(e) => setBilling({ ...billing, lastName: e.target.value })}
                  />
                  <Input
                    required
                    type="email"
                    placeholder="Email"
                    value={billing.email}
                    onChange={(e) => setBilling({ ...billing, email: e.target.value })}
                    readOnly={!!customer?.email}
                    className={customer?.email ? "bg-gray-100 cursor-not-allowed" : undefined}
                    aria-readonly={!!customer?.email}
                  />
                  <Input
                    required
                    placeholder="Phone"
                    value={billing.phone}
                    onChange={(e) => setBilling({ ...billing, phone: e.target.value })}
                  />
                  <Input
                    required
                    placeholder="Address line 1"
                    className="md:col-span-2"
                    value={billing.address1}
                    onChange={(e) => setBilling({ ...billing, address1: e.target.value })}
                  />
                  <Input
                    placeholder="Address line 2"
                    className="md:col-span-2"
                    value={billing.address2}
                    onChange={(e) => setBilling({ ...billing, address2: e.target.value })}
                  />
                  <Input
                    required
                    placeholder="City"
                    value={billing.city}
                    onChange={(e) => setBilling({ ...billing, city: e.target.value })}
                  />
                  <Input
                    required
                    placeholder="State"
                    value={billing.state}
                    onChange={(e) => setBilling({ ...billing, state: e.target.value })}
                  />
                  <Input
                    required
                    placeholder="PIN code"
                    value={billing.postalCode}
                    onChange={(e) => setBilling({ ...billing, postalCode: e.target.value })}
                  />
                </div>
              )}
            </section>

            <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Shipping method</h2>
              {shippingMethodsLoading && <p className="text-sm text-slate-500">Loading shipping options...</p>}
              {!shippingMethodsLoading && shippingMethods.length === 0 && (
                  <div className="p-3 bg-yellow-50 text-yellow-800 text-sm rounded-md">
                      No shipping options available for your address. Please verify your address details.
                  </div>
              )}
              <div className="space-y-3">
                {shippingMethods.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:border-green-500"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="shipping"
                        checked={shippingMethod === opt.id}
                        onChange={() => handleShippingSelect(opt.id)}
                      />
                      <span className="text-sm font-medium text-slate-800">{opt.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">
                      {opt.amount === 0 ? "Free" : formatMajor(opt.amount)}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Payment</h2>
              </div>
              <div className="space-y-3">
                <label className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:border-green-500">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentMethod === "razorpay"}
                      onChange={() => setPaymentMethod("razorpay")}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <span className="sr-only">Razorpay</span>
                        <Image
                          src="/razorpay_logo.png"
                          alt="Razorpay"
                          width={110}
                          height={30}
                          priority
                        />
                      </p>
                      <p className="text-xs text-slate-500">UPI, Cards, Netbanking</p>
                    </div>
                  </div>
                </label>
                <label className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:border-green-500">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="payment"
                      checked={paymentMethod === "cod"}
                      onChange={() => setPaymentMethod("cod")}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Cash on Delivery</p>
                      <p className="text-xs text-slate-500">Pay when the order arrives</p>
                    </div>
                  </div>
                </label>
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Referral code</h2>
              <Input
                placeholder="Enter referral code (optional)"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
              />
            </section>
          </div>

          <div className="lg:col-span-1 space-y-4">
            <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-4 sticky top-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Order summary</h2>
                {loadingCart && <span className="text-xs text-slate-500">LoadingΓÇª</span>}
              </div>
              <div className="divide-y border rounded-lg">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3">
                    <div className="h-14 w-14 rounded bg-slate-100 relative overflow-hidden">
                      {item.thumbnail ? (
                        <Image src={item.thumbnail} alt={item.title} fill className="object-contain" />
                      ) : null}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900 line-clamp-2">{item.title}</p>
                      <p className="text-xs text-slate-500">Qty {item.quantity}</p>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {formatInr((item.unit_price || 0) * (item.quantity || 1))}
                    </div>
                  </div>
                ))}
                {!cartItems.length && (
                  <div className="p-4 text-sm text-slate-500 text-center">No items in cart</div>
                )}
              </div>
              <div className="space-y-2 text-sm text-slate-700">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold">{formatInr((serverTotals || clientTotals).subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-semibold">
                    {(serverTotals || clientTotals).shipping === 0 ? "Free" : formatInr((serverTotals || clientTotals).shipping)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-semibold text-slate-900 pt-2 border-t">
                  <span>Total</span>
                  <span>{formatInr((serverTotals || clientTotals).total)}</span>
                </div>
                {totalsLoading && <div className="text-xs text-slate-500">Refreshing totals...</div>}
                {totalWarning && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
                    {totalWarning}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
                disabled={
                  processing ||
                  (!isBuyNow && !cartItems.length) ||
                  (isBuyNow && !buyNowItem && !variantFromQuery)
                }
              >
                {processing ? "Processing PaymentΓÇª" : `Pay securely (${formatInr((serverTotals || clientTotals).total)})`}
              </Button>
              {isRazorpayTest && (
                <p className="text-xs text-slate-500 text-center">
                  Payment is processed in Razorpay TEST MODE. Do not use real credentials.
                </p>
              )}
            </section>
          </div>
        </form>
      </div>
      {loginModalOpen && (
        <div className="fixed inset-0 z-[999] bg-black/30 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sign in to continue</h2>
                <p className="text-xs text-gray-600">Log in to place your order securely.</p>
              </div>
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-800"
                onClick={() => {
                  setLoginModalOpen(false);
                }}
              >
                Close
              </button>
            </div>
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <Input
                required
                type="email"
                placeholder="Email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
              <Input
                required
                type="password"
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
              {loginError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {loginError}
                </div>
              )}
              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={loginBusy}
              >
                {loginBusy ? "Signing in..." : "Login & continue"}
              </Button>
              <p className="text-xs text-gray-500">
                New here?{" "}
                <Link href="/signup" className="text-emerald-700 font-semibold">
                  Create an account
                </Link>
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-600">
          Loading checkoutΓÇª
        </div>
      }
    >
      <CheckoutPageInner />
    </Suspense>
  );
}





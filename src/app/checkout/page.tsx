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
import { Check, ChevronRight, CreditCard, MapPin, Truck, Wallet } from "lucide-react";

type CheckoutStep = 1 | 2 | 3;

const StepHeader = ({
  step,
  currentStep,
  title,
  icon: Icon,
  isCompleted,
  onClick
}: {
  step: CheckoutStep;
  currentStep: CheckoutStep;
  title: string;
  icon: any;
  isCompleted: boolean;
  onClick?: () => void;
}) => {
  const isActive = currentStep === step;
  const isPast = currentStep > step;

  return (
    <div
      onClick={isCompleted || isPast ? onClick : undefined}
      className={`flex items-center gap-3 p-4 ${isActive ? 'bg-green-50/50 text-green-900' : isPast ? 'bg-white cursor-pointer hover:bg-slate-50' : 'bg-white text-slate-400'} border-b transition-all duration-200 select-none`}
    >
      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shadow-sm transition-all ${isActive ? 'bg-green-600 text-white shadow-green-200' :
        isCompleted || isPast ? 'bg-green-500 text-white shadow-green-200' : 'bg-slate-100 text-slate-500'
        }`}>
        {isCompleted || isPast ? <Check className="w-5 h-5" /> : step}
      </div>
      <div className="flex-1 font-semibold text-lg flex items-center gap-2">
        <Icon className={`w-5 h-5 ${isActive ? 'text-green-600' : isCompleted || isPast ? 'text-green-600' : 'text-slate-300'}`} />
        <span className={isActive ? 'text-slate-900' : isCompleted || isPast ? 'text-slate-900' : 'text-slate-400'}>{title}</span>
      </div>
      {(isCompleted || isPast) && !isActive && (
        <div className="text-xs font-medium text-emerald-600 uppercase tracking-wide px-2 py-1 bg-emerald-50 rounded">
          Change
        </div>
      )}
    </div>
  );
};

const AddressCard = ({
  address,
  selected,
  onSelect
}: {
  address: CustomerAddress;
  selected: boolean;
  onSelect: () => void;
}) => {
  return (
    <div
      onClick={onSelect}
      className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${selected ? 'border-green-600 bg-green-50/50' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
        }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center ${selected ? 'border-green-600 bg-green-600' : 'border-slate-300'
          }`}>
          {selected && <div className="w-2 h-2 bg-white rounded-full" />}
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{address.first_name} {address.last_name}</span>
            {address.phone && <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{address.phone}</span>}
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            {address.address_1}
            {address.address_2 && <>, {address.address_2}</>}
            <br />
            {address.city}, {address.province} - {address.postal_code}
            <br />
            <span className="uppercase text-xs font-medium text-slate-400">{address.country_code || 'IN'}</span>
          </p>
        </div>
      </div>
    </div>
  );
};

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

type CustomerAddress = {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country_code?: string;
  is_default_shipping?: boolean;
  is_default_billing?: boolean;
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

  // checkout stepping
  const [currentStep, setCurrentStep] = useState<CheckoutStep>(1);
  const [completedSteps, setCompletedSteps] = useState<{ [key in CheckoutStep]?: boolean }>({});

  const finishStep = (step: CheckoutStep) => {
    setCompletedSteps(prev => ({ ...prev, [step]: true }));
    if (step < 3) setCurrentStep((prev) => (prev + 1) as CheckoutStep);
  };

  const jumpToStep = (step: CheckoutStep) => {
    if (step < currentStep || completedSteps[(step - 1) as CheckoutStep] || completedSteps[step]) {
      setCurrentStep(step);
    }
  };

  const { options: shippingMethods, isLoading: shippingMethodsLoading, refetch: refetchShipping } = useShippingOptions(cart?.id);

  useEffect(() => {
    if (shippingMethods.length > 0 && !shippingMethod) {
      setShippingMethod(shippingMethods[0].id)
    }
  }, [shippingMethods, shippingMethod])

  const [referralCode, setReferralCode] = useState("");
  const [referralCodeApplied, setReferralCodeApplied] = useState(false); // Track if auto-applied
  const [referralLoading, setReferralLoading] = useState(false);

  // Auto-fetch referral code from database for logged in customers
  useEffect(() => {
    const fetchReferralCode = async () => {
      if (!customer?.id) return;

      setReferralLoading(true);
      try {
        const res = await fetch('/api/store/referral-code', {
          headers: { 'x-customer-id': customer.id },
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          if (data.referral_code) {
            setReferralCode(data.referral_code);
            setReferralCodeApplied(true);
            console.log('Auto-applied referral code:', data.referral_code);
          }
        }
      } catch (error) {
        console.error('Failed to fetch referral code:', error);
      } finally {
        setReferralLoading(false);
      }
    };

    fetchReferralCode();
  }, [customer?.id]);

  // Handler to cancel/remove the referral code
  const handleCancelReferral = () => {
    setReferralCode("");
    setReferralCodeApplied(false);
  };

  // WALLET SYSTEM STATE
  const [walletBalance, setWalletBalance] = useState(0);
  const [_walletPending, setWalletPending] = useState(0);
  const [_walletLocked, setWalletLocked] = useState(0);
  const [walletExpiring, setWalletExpiring] = useState(0);
  const [walletAdjustmentMessage, setWalletAdjustmentMessage] = useState<string | null>(null);
  const [walletCanRedeem, setWalletCanRedeem] = useState(true);
  const [walletLoading, setWalletLoading] = useState(false);
  const [useCoins, setUseCoins] = useState(false);
  const [coinsToUse, setCoinsToUse] = useState(0);
  const [coinDiscountCode, setCoinDiscountCode] = useState<string | null>(null);
  const [applyingCoinDiscount, setApplyingCoinDiscount] = useState(false);

  // Fetch wallet balance when customer loads
  useEffect(() => {
    const fetchWallet = async () => {
      if (!customer?.id) {
        setWalletBalance(0);
        setWalletExpiring(0);
        return;
      }

      setWalletLoading(true);
      try {
        const res = await fetch('/api/store/wallet', {
          headers: { 'x-customer-id': customer.id },
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setWalletBalance(data.balance || 0);
          setWalletPending(data.pending_coins || 0);
          setWalletLocked(data.locked_coins || 0);
          setWalletExpiring(data.expiring_soon || 0);
          setWalletAdjustmentMessage(data.adjustment_message || null);
          setWalletCanRedeem(data.can_redeem !== false);
          console.log('Wallet loaded:', data);
        }
      } catch (error) {
        console.error('Failed to fetch wallet:', error);
      } finally {
        setWalletLoading(false);
      }
    };

    fetchWallet();
  }, [customer?.id]);

  // Calculate max redeemable coins based on order total (tiered limits)
  const getMaxRedeemableCoins = (orderTotal: number): number => {
    if (orderTotal < 200) return 20;
    if (orderTotal < 500) return 40;
    if (orderTotal < 1000) return 60;
    if (orderTotal < 1500) return 100;
    return 150; // ₹1500+
  };

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
  const [_addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [defaultAddress, setDefaultAddress] = useState<CustomerAddress | null>(null);
  const [addressTouched, setAddressTouched] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [showSaveDefault, setShowSaveDefault] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);

  const handleAddressSelect = (addr: CustomerAddress) => {
    setDefaultAddress(addr); // Visually select
    setShipping({
      firstName: addr.first_name || "",
      lastName: addr.last_name || "",
      email: shipping.email, // keep email
      phone: addr.phone || "",
      address1: addr.address_1 || "",
      address2: addr.address_2 || "",
      city: addr.city || "",
      state: addr.province || "",
      postalCode: addr.postal_code || "",
      countryCode: addr.country_code || "IN",
    });
    setShowAddressForm(false);
  };

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
    const loadAddresses = async () => {
      if (!customer?.id) {
        setAddresses([]);
        setDefaultAddress(null);
        return;
      }
      try {
        const res = await fetch("/api/medusa/customer-addresses", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.addresses || data?.customer?.addresses || []) as CustomerAddress[];
        setAddresses(list);
        const def = list.find((addr) => addr.is_default_shipping) || list[0] || null;
        setDefaultAddress(def);
        if (def && !addressTouched) {
          setShipping((prev) => ({
            ...prev,
            firstName: def.first_name || prev.firstName,
            lastName: def.last_name || prev.lastName,
            phone: def.phone || prev.phone,
            address1: def.address_1 || prev.address1,
            address2: def.address_2 || prev.address2,
            city: def.city || prev.city,
            state: def.province || prev.state,
            postalCode: def.postal_code || prev.postalCode,
            countryCode: def.country_code || prev.countryCode || "IN",
          }));
        }
      } catch (error) {
        console.warn("Failed to load customer addresses", error);
      }
    };

    loadAddresses();
  }, [customer?.id, addressTouched]);

  useEffect(() => {
    if (!defaultAddress) {
      setShowSaveDefault(Boolean(customer?.id));
      return;
    }
    const normalize = (value?: string | null) => (value || "").trim().toLowerCase();
    const changed =
      normalize(defaultAddress.first_name) !== normalize(shipping.firstName) ||
      normalize(defaultAddress.last_name) !== normalize(shipping.lastName) ||
      normalize(defaultAddress.phone) !== normalize(shipping.phone) ||
      normalize(defaultAddress.address_1) !== normalize(shipping.address1) ||
      normalize(defaultAddress.address_2) !== normalize(shipping.address2) ||
      normalize(defaultAddress.city) !== normalize(shipping.city) ||
      normalize(defaultAddress.province) !== normalize(shipping.state) ||
      normalize(defaultAddress.postal_code) !== normalize(shipping.postalCode) ||
      normalize(defaultAddress.country_code) !== normalize(shipping.countryCode);
    setShowSaveDefault(changed);
    if (!changed) {
      setSaveAsDefault(false);
    }
  }, [defaultAddress, shipping, customer?.id]);

  const saveDefaultAddress = async () => {
    if (!customer?.id || !saveAsDefault) return;
    const payload = {
      first_name: shipping.firstName,
      last_name: shipping.lastName,
      phone: shipping.phone,
      address_1: shipping.address1,
      address_2: shipping.address2,
      city: shipping.city,
      province: shipping.state,
      postal_code: shipping.postalCode,
      country_code: shipping.countryCode || "IN",
      is_default_shipping: true,
      is_default_billing: true,
    };

    try {
      setSavingAddress(true);
      if (defaultAddress?.id) {
        await fetch(`/api/medusa/customer-addresses/${encodeURIComponent(defaultAddress.id)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/medusa/customer-addresses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      }
    } catch (error) {
      console.warn("Failed to save default address", error);
    } finally {
      setSavingAddress(false);
    }
  };

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

  // Calculate wallet coin values (after serverTotals and clientTotals are defined)
  const orderTotal = (serverTotals || clientTotals).total;
  const maxRedeemable = getMaxRedeemableCoins(orderTotal);
  // Trust coinsToUse when useCoins is checked, as it was validated at the time of checking.
  // We don't want to re-clamp against walletBalance because it might decrease after deduction on backend.
  const coinDiscount = useCoins ? coinsToUse : 0;

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
            coinDiscount: (() => {
              const discountValue = useCoins ? coinsToUse / 100 : 0; // Convert coins (paise) to rupees
              console.log("🔥🔥🔥 [Frontend] Draft Order Coin Discount:", { useCoins, coinsToUse, coinDiscountRupees: discountValue });
              return discountValue;
            })(),
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
      coinDiscountCode: coinDiscountCode || undefined,
      coinDiscount: useCoins ? coinsToUse : 0,
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

    if (saveAsDefault) {
      await saveDefaultAddress();
    }

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
            {/* STEP 1: DELIVERY ADDRESS */}
            <div className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${currentStep === 1 ? 'ring-2 ring-green-600 ring-offset-2' : ''}`}>
              <StepHeader
                step={1}
                currentStep={currentStep}
                title="Delivery Address"
                icon={MapPin}
                isCompleted={!!completedSteps[1]}
                onClick={() => jumpToStep(1)}
              />

              {currentStep === 1 && (
                <div className="p-4 md:p-6 animate-in slide-in-from-top-2 space-y-6">
                  {/* Saved Addresses List */}
                  {customer?.id && _addresses.length > 0 && !showAddressForm && (
                    <div className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        {_addresses.map(addr => (
                          <AddressCard
                            key={addr.id}
                            address={addr}
                            selected={defaultAddress?.id === addr.id}
                            onSelect={() => handleAddressSelect(addr)}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddressForm(true);
                          setDefaultAddress(null);
                          setShipping({ ...shipping, firstName: "", lastName: "", address1: "", address2: "", city: "", postalCode: "" });
                        }}
                        className="text-sm font-semibold text-green-600 flex items-center gap-1 hover:underline px-1"
                      >
                        + Add a new address
                      </button>
                    </div>
                  )}

                  {/* Address Form */}
                  {(!customer?.id || _addresses.length === 0 || showAddressForm) && (
                    <div className="space-y-4">
                      {showAddressForm && (
                        <button type="button" onClick={() => setShowAddressForm(false)} className="text-xs font-medium text-slate-500 hover:text-green-600 mb-2 flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 rotate-180" /> Back to saved addresses
                        </button>
                      )}

                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-slate-900">Enter delivery details</h3>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <Input
                          required
                          placeholder="First name"
                          value={shipping.firstName}
                          onChange={(e) => {
                            setAddressTouched(true);
                            setShipping({ ...shipping, firstName: e.target.value });
                          }}
                        />
                        <Input
                          placeholder="Last name"
                          value={shipping.lastName}
                          onChange={(e) => {
                            setAddressTouched(true);
                            setShipping({ ...shipping, lastName: e.target.value });
                          }}
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
                          onChange={(e) => {
                            setAddressTouched(true);
                            setShipping({ ...shipping, phone: e.target.value });
                          }}
                        />
                        <Input
                          required
                          placeholder="Address line 1"
                          className="md:col-span-2"
                          value={shipping.address1}
                          onChange={(e) => {
                            setAddressTouched(true);
                            setShipping({ ...shipping, address1: e.target.value });
                          }}
                        />
                        <Input
                          placeholder="Address line 2"
                          className="md:col-span-2"
                          value={shipping.address2}
                          onChange={(e) => {
                            setAddressTouched(true);
                            setShipping({ ...shipping, address2: e.target.value });
                          }}
                        />
                        <Input
                          required
                          placeholder="City"
                          value={shipping.city}
                          onChange={(e) => {
                            setAddressTouched(true);
                            setShipping({ ...shipping, city: e.target.value });
                          }}
                        />
                        <Input
                          required
                          placeholder="State"
                          value={shipping.state}
                          onChange={(e) => {
                            setAddressTouched(true);
                            setShipping({ ...shipping, state: e.target.value });
                          }}
                        />
                        <Input
                          required
                          placeholder="PIN code"
                          value={shipping.postalCode}
                          onChange={(e) => {
                            setAddressTouched(true);
                            setShipping({ ...shipping, postalCode: e.target.value });
                          }}
                        />
                      </div>

                      {showSaveDefault && customer?.id && (
                        <label className="flex items-center gap-2 text-sm text-slate-600 mt-2">
                          <input
                            type="checkbox"
                            checked={saveAsDefault}
                            onChange={(e) => setSaveAsDefault(e.target.checked)}
                            disabled={savingAddress}
                            className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                          />
                          <span>Save this as default address for next time</span>
                          {savingAddress && <span className="text-xs text-slate-400">Saving...</span>}
                        </label>
                      )}
                    </div>
                  )}

                  <div className="pt-4 border-t flex justify-end">
                    <Button
                      type="button"
                      onClick={() => {
                        const isValid = shipping.firstName && shipping.address1 && shipping.city && shipping.postalCode && shipping.phone;
                        if (!isValid) {
                          toast.error("Please fill in all required address details");
                          return;
                        }
                        finishStep(1);
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white min-w-[140px]"
                    >
                      Deliver Here
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 2: DELIVERY OPTIONS */}
            <div className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${currentStep === 2 ? 'ring-2 ring-green-600 ring-offset-2' : ''}`}>
              <StepHeader
                step={2}
                currentStep={currentStep}
                title="Delivery Options"
                icon={Truck}
                isCompleted={!!completedSteps[2]}
                onClick={() => jumpToStep(2)}
              />

              {currentStep === 2 && (
                <div className="p-4 md:p-6 animate-in slide-in-from-top-2 space-y-6">
                  {shippingMethodsLoading && <p className="text-sm text-slate-500 animate-pulse">Loading shipping options...</p>}

                  {!shippingMethodsLoading && shippingMethods.length === 0 && (
                    <div className="p-3 bg-amber-50 text-amber-800 text-sm rounded-md border border-amber-200">
                      No shipping options available for your location.
                    </div>
                  )}

                  <div className="space-y-3">
                    {shippingMethods.map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all ${shippingMethod === opt.id ? 'border-green-600 bg-green-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="shipping"
                            checked={shippingMethod === opt.id}
                            onChange={() => handleShippingSelect(opt.id)}
                            className="w-5 h-5 text-green-600 border-gray-300 focus:ring-green-500"
                          />
                          <div>
                            <span className="text-base font-medium text-slate-900">{opt.name}</span>
                            <p className="text-xs text-slate-500">Standard Delivery</p>
                          </div>
                        </div>
                        <span className="text-base font-semibold text-slate-900">
                          {opt.amount === 0 ? "Free" : formatMajor(opt.amount)}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="pt-4 border-t flex justify-between">
                    <Button type="button" variant="ghost" onClick={() => jumpToStep(1)}>
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        if (!shippingMethod) {
                          toast.error("Please select a shipping method");
                          return;
                        }
                        finishStep(2);
                      }}
                      disabled={!shippingMethod}
                      className="bg-green-600 hover:bg-green-700 text-white min-w-[120px]"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 3: PAYMENT & OFFERS */}
            <div className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${currentStep === 3 ? 'ring-2 ring-green-600 ring-offset-2' : ''}`}>
              <StepHeader
                step={3}
                currentStep={currentStep}
                title="Payment & Offers"
                icon={CreditCard}
                isCompleted={!!completedSteps[3]}
                onClick={() => jumpToStep(3)}
              />

              {currentStep === 3 && (
                <div className="p-4 md:p-6 animate-in slide-in-from-top-2 space-y-8">

                  {/* WALLET & OFFERS */}
                  {customer && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-green-600" /> Wallet & Offers
                      </h3>

                      {/* Wallet Logic */}
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        {walletLoading ? (
                          <p className="text-sm text-slate-500">Loading wallet...</p>
                        ) : walletBalance > 0 ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-slate-900">Your Balance</p>
                                <div className="flex items-center gap-2">
                                  <p className="text-2xl font-bold text-green-600">{Math.round(walletBalance)}</p>
                                  <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Coins</span>
                                </div>
                              </div>
                              {walletExpiring > 0 && (
                                <div className="text-right">
                                  <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                                    ⏰ {Math.round(walletExpiring)} expiring soon
                                  </p>
                                </div>
                              )}
                              {walletAdjustmentMessage && (
                                <div className="text-right mt-1 w-full">
                                  <p className="text-xs text-slate-500 italic bg-slate-100/50 px-2 py-1 rounded inline-block">
                                    {walletAdjustmentMessage}
                                  </p>
                                </div>
                              )}
                            </div>

                            <label className={`flex items-start gap-3 p-3 bg-white border rounded-lg cursor-pointer transition-all ${useCoins ? 'border-green-600 ring-1 ring-green-600' : 'hover:border-slate-300'}`}>
                              <input
                                type="checkbox"
                                checked={useCoins}
                                onChange={async (e) => {
                                  const isChecked = e.target.checked;

                                  if (isChecked) {
                                    if (!cart?.id || cart.id === "buy-now") {
                                      toast.error("Coin discount is available only for cart checkout.");
                                      setUseCoins(false);
                                      setCoinsToUse(0);
                                      setCoinDiscountCode(null);
                                      return;
                                    }
                                    // User wants to use coins
                                    const maxCoins = Math.min(walletBalance, orderTotal, maxRedeemable);
                                    const coinsInMinorUnits = Math.round(maxCoins * 100); // Convert to minor units

                                    setApplyingCoinDiscount(true);
                                    try {
                                      // Step 1: Create Medusa discount code
                                      const discountRes = await fetch('/api/store/wallet/create-coin-discount', {
                                        method: 'POST',
                                        headers: { 'content-type': 'application/json' },
                                        body: JSON.stringify({
                                          customer_id: customer?.id,
                                          cart_id: cart?.id,
                                          coin_amount: coinsInMinorUnits
                                        })
                                      });

                                      if (!discountRes.ok) {
                                        const error = await discountRes.json();
                                        throw new Error(error.error || 'Failed to create discount');
                                      }

                                      const discountData = await discountRes.json();
                                      const { discount_code } = discountData;

                                      // Step 2: Apply discount to Medusa cart
                                      const applyRes = await fetch('/api/store/cart/apply-discount', {
                                        method: 'POST',
                                        headers: { 'content-type': 'application/json' },
                                        body: JSON.stringify({
                                          cart_id: cart?.id,
                                          discount_code
                                        })
                                      });

                                      if (!applyRes.ok) {
                                        let message = 'Failed to apply discount to cart';
                                        try {
                                          const errorPayload = await applyRes.json();
                                          if (errorPayload?.error) message = String(errorPayload.error);
                                          if (errorPayload?.details) {
                                            const details = typeof errorPayload.details === "string"
                                              ? errorPayload.details
                                              : JSON.stringify(errorPayload.details);
                                            message = `${message}: ${details}`;
                                          }
                                        } catch {
                                          // ignore parse errors
                                        }
                                        throw new Error(message);
                                      }

                                      // Success! Update state
                                      setUseCoins(true);
                                      setCoinsToUse(maxCoins);
                                      setCoinDiscountCode(discount_code);
                                      toast.success(`₹${maxCoins.toFixed(2)} coin discount applied!`);

                                    } catch (error) {
                                      console.error('Coin discount error:', error);
                                      toast.error(error instanceof Error ? error.message : 'Failed to apply coin discount');
                                      setUseCoins(false);
                                      setCoinsToUse(0);
                                      setCoinDiscountCode(null);
                                    } finally {
                                      setApplyingCoinDiscount(false);
                                    }

                                  } else {
                                    // User wants to remove coins
                                    if (coinDiscountCode && cart?.id) {
                                      setApplyingCoinDiscount(true);
                                      try {
                                        // Remove discount from cart
                                        await fetch(`/api/store/cart/apply-discount?cart_id=${cart.id}&discount_code=${coinDiscountCode}`, {
                                          method: 'DELETE'
                                        });

                                        // Refund coins back to wallet
                                        await fetch('/api/store/wallet/refund-coin-discount', {
                                          method: 'POST',
                                          headers: { 'content-type': 'application/json' },
                                          body: JSON.stringify({
                                            customer_id: customer?.id,
                                            discount_code: coinDiscountCode
                                          })
                                        });

                                        toast.success("Coins refunded to your wallet");

                                      } catch (error) {
                                        console.error('Failed to remove discount:', error);
                                      } finally {
                                        setApplyingCoinDiscount(false);
                                      }
                                    }

                                    setUseCoins(false);
                                    setCoinsToUse(0);
                                    setCoinDiscountCode(null);
                                  }
                                }}
                                className="mt-1 w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                disabled={applyingCoinDiscount || !walletCanRedeem}
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-slate-900">
                                  Use {Math.round(Math.min(walletBalance, maxRedeemable))} coins
                                </p>
                                <p className="text-xs text-slate-500">
                                  Save <span className="font-semibold text-green-600">₹{Math.round(Math.min(walletBalance, orderTotal, maxRedeemable))}</span> on this order
                                </p>
                                {applyingCoinDiscount && (
                                  <p className="text-xs text-green-600 mt-1 animate-pulse">Applying discount...</p>
                                )}
                              </div>
                            </label>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500 text-center py-2">
                            No coins available. Earn coins on this order!
                          </div>
                        )}
                      </div>

                      {/* Referral Logic */}
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                        <p className="text-sm font-medium text-slate-900 mb-2">Have a referral code?</p>
                        {referralLoading ? (
                          <p className="text-sm text-slate-500 animate-pulse">Checking code...</p>
                        ) : referralCodeApplied && referralCode ? (
                          <div className="flex items-center justify-between bg-green-100/50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                              <div className="bg-green-100 p-1 rounded-full text-green-600">
                                <Check className="w-3 h-3" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-green-800">Code applied</p>
                                <p className="text-xs text-green-600 font-mono">{referralCode}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={handleCancelReferral}
                              className="text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              placeholder="Enter code"
                              value={referralCode}
                              onChange={(e) => setReferralCode(e.target.value)}
                              className="bg-white"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PAYMENT METHOD */}
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-green-600" /> Payment Method
                    </h3>
                    <div className="space-y-3">
                      <label className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all ${paymentMethod === "razorpay" ? 'border-green-600 bg-green-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${paymentMethod === 'razorpay' ? 'border-green-600' : 'border-slate-300'}`}>
                            {paymentMethod === 'razorpay' && <div className="w-2.5 h-2.5 bg-green-600 rounded-full" />}
                          </div>
                          <input
                            type="radio"
                            name="payment"
                            className="hidden"
                            checked={paymentMethod === "razorpay"}
                            onChange={() => setPaymentMethod("razorpay")}
                          />
                          <div>
                            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                              Online Payment
                              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">Fast</span>
                            </p>
                            <p className="text-xs text-slate-500">UPI, Cards, Wallets, Netbanking</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Image src="/razorpay_logo.png" alt="Razorpay" width={80} height={20} className="opacity-80 grayscale" unoptimized />
                        </div>
                      </label>

                      <label className={`flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all ${paymentMethod === "cod" ? 'border-green-600 bg-green-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${paymentMethod === 'cod' ? 'border-green-600' : 'border-slate-300'}`}>
                            {paymentMethod === 'cod' && <div className="w-2.5 h-2.5 bg-green-600 rounded-full" />}
                          </div>
                          <input
                            type="radio"
                            name="payment"
                            className="hidden"
                            checked={paymentMethod === "cod"}
                            onChange={() => setPaymentMethod("cod")}
                          />
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Cash on Delivery</p>
                            <p className="text-xs text-slate-500">Pay lightly extra for handling</p>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* BILLING ADDRESS */}
                  <div className="space-y-4 pt-4 border-t">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={billingSame}
                        onChange={e => setBillingSame(e.target.checked)}
                        className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                      />
                      <span>Billing address is the same as delivery address</span>
                    </label>

                    {!billingSame && (
                      <div className="grid md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-in slide-in-from-top-1">
                        <div className="md:col-span-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Billing Details</div>
                        <Input
                          required
                          placeholder="First name"
                          value={billing.firstName}
                          onChange={(e) => setBilling({ ...billing, firstName: e.target.value })}
                          className="bg-white"
                        />
                        <Input
                          placeholder="Last name"
                          value={billing.lastName}
                          onChange={(e) => setBilling({ ...billing, lastName: e.target.value })}
                          className="bg-white"
                        />
                        <Input
                          required
                          type="email"
                          placeholder="Email"
                          value={billing.email}
                          onChange={(e) => setBilling({ ...billing, email: e.target.value })}
                          className="bg-white"
                        />
                        <Input
                          required
                          placeholder="Phone"
                          value={billing.phone}
                          onChange={(e) => setBilling({ ...billing, phone: e.target.value })}
                          className="bg-white"
                        />
                        <Input
                          required
                          placeholder="Address line 1"
                          className="md:col-span-2 bg-white"
                          value={billing.address1}
                          onChange={(e) => setBilling({ ...billing, address1: e.target.value })}
                        />
                        <Input
                          placeholder="Address line 2"
                          className="md:col-span-2 bg-white"
                          value={billing.address2}
                          onChange={(e) => setBilling({ ...billing, address2: e.target.value })}
                        />
                        <Input
                          required
                          placeholder="City"
                          value={billing.city}
                          onChange={(e) => setBilling({ ...billing, city: e.target.value })}
                          className="bg-white"
                        />
                        <Input
                          required
                          placeholder="State"
                          value={billing.state}
                          onChange={(e) => setBilling({ ...billing, state: e.target.value })}
                          className="bg-white"
                        />
                        <Input
                          required
                          placeholder="PIN code"
                          value={billing.postalCode}
                          onChange={(e) => setBilling({ ...billing, postalCode: e.target.value })}
                          className="bg-white"
                        />
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
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
                {/* Coin Discount Line */}
                {useCoins && coinDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span><img src="/uploads/coin/coin.png" alt="Coin" className="w-5 h-5 inline-block object-contain mr-1" /> Coin Discount</span>
                    <span className="font-semibold">-{formatInr(coinDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-semibold text-slate-900 pt-2 border-t">
                  <span>Total</span>
                  <span>{formatInr(Math.max(0, (serverTotals || clientTotals).total - coinDiscount))}</span>
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
                  currentStep < 3 ||
                  (!isBuyNow && !cartItems.length) ||
                  (isBuyNow && !buyNowItem && !variantFromQuery)
                }
              >
                {processing ? "Processing Payment…" : `Pay securely (${formatInr(Math.max(0, (serverTotals || clientTotals).total - coinDiscount))})`}
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





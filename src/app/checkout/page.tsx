"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthProvider";
import { calculateOweg10Discount, OWEG10_CODE } from "@/lib/oweg10-shared";
import { calculateStatewiseShipping } from "@/lib/shipping-rules";

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

const INDIAN_STATES_AND_UTS = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

function getStateSuggestions(queryValue: string): string[] {
  const query = queryValue.trim().toLowerCase();
  if (!query) return INDIAN_STATES_AND_UTS.slice(0, 12);

  const startsWith: string[] = [];
  const contains: string[] = [];

  for (const stateName of INDIAN_STATES_AND_UTS) {
    const lowered = stateName.toLowerCase();
    if (!lowered.includes(query)) continue;
    if (lowered.startsWith(query)) {
      startsWith.push(stateName);
    } else {
      contains.push(stateName);
    }
  }

  return [...startsWith, ...contains].slice(0, 12);
}


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
  const [oweg10Applied, setOweg10Applied] = useState(false);
  const [oweg10Status, setOweg10Status] = useState<{
    loading: boolean;
    canApply: boolean;
    consumed: boolean;
    pending: boolean;
  }>({
    loading: true,
    canApply: false,
    consumed: false,
    pending: false,
  });
  const [oweg10StatusCustomerId, setOweg10StatusCustomerId] = useState<string | null>(null);
  const [pendingLoginCheckout, setPendingLoginCheckout] = useState(false);
  const autoCheckoutNoticeShownRef = useRef(false);
  const performCheckoutRef = useRef<(() => Promise<void>) | null>(null);

  const [referralCode, setReferralCode] = useState("");
  const [referralCodeApplied, setReferralCodeApplied] = useState(false); // Track if auto-applied
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralValidating, setReferralValidating] = useState(false);
  const [referralAgentName, setReferralAgentName] = useState("");

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
            setReferralCodeApplied(data.locked !== false);
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

  useEffect(() => {
    let cancelled = false;

    if (!customer?.id) {
      setOweg10Applied(false);
      setOweg10StatusCustomerId(null);
      setOweg10Status({
        loading: false,
        canApply: false,
        consumed: false,
        pending: false,
      });
      return;
    }

    const loadOweg10Status = async () => {
      try {
        setOweg10StatusCustomerId(null);
        setOweg10Status((prev) => ({ ...prev, loading: true }));
        const res = await fetch("/api/store/oweg10/status", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        const canApply = Boolean(data?.canApply);
        setOweg10StatusCustomerId(customer.id);
        setOweg10Status({
          loading: false,
          canApply,
          consumed: Boolean(data?.consumed),
          pending: Boolean(data?.pending),
        });
        if (!canApply) {
          setOweg10Applied(false);
        }
      } catch {
        if (cancelled) return;
        setOweg10StatusCustomerId(customer.id);
        setOweg10Status({
          loading: false,
          canApply: false,
          consumed: false,
          pending: false,
        });
        setOweg10Applied(false);
      }
    };

    void loadOweg10Status();

    return () => {
      cancelled = true;
    };
  }, [customer?.id]);

  const isOweg10StatusReady = !customer?.id || (oweg10StatusCustomerId === customer.id && !oweg10Status.loading);

  // Handler to apply the referral code manually
  const handleApplyReferral = async () => {
    const trimmed = referralCode.trim();
    if (!trimmed) return;
    setReferralValidating(true);
    try {
      // 1. Validate the code
      const validateRes = await fetch(`/api/store/validate-referral?code=${encodeURIComponent(trimmed)}`)
      const validateData = await validateRes.json();
      
      if (!validateData.valid) {
        toast.error("Invalid referral code.");
        setReferralValidating(false);
        return;
      }

      // 2. If valid, try to save it to the customer profile permanently
      if (customer?.id) {
        const saveRes = await fetch('/api/store/save-referral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customer.id,
            referral_code: trimmed
          })
        });

        const saveData = await saveRes.json();
        
        if (!saveRes.ok) {
           // It might fail if they already have one locked
           const reason = saveData?.message || saveData?.error || "Could not apply referral code.";
           toast.error(reason);
           if (saveData?.existing_code) {
            setReferralCode(saveData.existing_code);
            setReferralCodeApplied(true);
           }
           setReferralValidating(false);
           return;
        }
      }

      // 3. Success! Lock UI.
      setReferralCodeApplied(true);
      setReferralAgentName(validateData.agent_name || "");
      toast.success(`Referral applied: ${validateData.agent_name}`);
      
    } catch {
      toast.error("Error applying referral code.");
    } finally {
      setReferralValidating(false);
    }
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
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [billingStateDropdownOpen, setBillingStateDropdownOpen] = useState(false);
  const toDigits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);
  const normalizeEmail = (value: string) => value.replace(/\s+/g, "").trim();

  const shippingStateSuggestions = useMemo(() => getStateSuggestions(shipping.state), [shipping.state]);
  const billingStateSuggestions = useMemo(() => getStateSuggestions(billing.state), [billing.state]);

  // Prefill email and referral code from logged-in customer
  useEffect(() => {
    if (customer?.email) {
      const normalizedCustomerEmail = normalizeEmail(customer.email as string);
      setShipping((prev) => (prev.email ? prev : { ...prev, email: normalizedCustomerEmail }));
      setBilling((prev) => (prev.email ? prev : { ...prev, email: normalizedCustomerEmail }));
    }
    const meta = (customer?.metadata || {}) as { referral_code?: string; referral?: string; referralCode?: string };
    const refCode = meta.referral_code || meta.referral || meta.referralCode;
    if (refCode && !referralCode) {
      setReferralCode(refCode);
    }
  }, [customer, referralCode]);

  // Prefill PIN code and State from header location selector (localStorage)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedPin = window.localStorage.getItem("oweg_pincode") || "";
    const savedPlace = window.localStorage.getItem("oweg_pincode_place") || "";
    // Extract state: last segment of "City, District, State" string
    const statePart = savedPlace ? (savedPlace.split(",").pop() || "").trim() : "";
    if (savedPin || statePart) {
      setShipping((prev) => ({
        ...prev,
        postalCode: prev.postalCode || savedPin,
        state: prev.state || statePart,
      }));
      setBilling((prev) => ({
        ...prev,
        postalCode: prev.postalCode || savedPin,
        state: prev.state || statePart,
      }));
    }
  }, []);

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
        const defaultShipping = list.find((addr) => addr.is_default_shipping) || list[0] || null;
        const defaultBilling = list.find((addr) => addr.is_default_billing) || defaultShipping;
        setDefaultAddress(defaultShipping);
        if (!addressTouched) {
          if (defaultShipping) {
            setShipping((prev) => ({
              ...prev,
              firstName: defaultShipping.first_name || prev.firstName,
              lastName: defaultShipping.last_name || prev.lastName,
              phone: defaultShipping.phone || prev.phone,
              address1: defaultShipping.address_1 || prev.address1,
              address2: defaultShipping.address_2 || prev.address2,
              city: defaultShipping.city || prev.city,
              state: defaultShipping.province || prev.state,
              postalCode: defaultShipping.postal_code || prev.postalCode,
              countryCode: defaultShipping.country_code || prev.countryCode || "IN",
            }));
          }
          if (defaultBilling) {
            setBilling((prev) => ({
              ...prev,
              firstName: defaultBilling.first_name || prev.firstName,
              lastName: defaultBilling.last_name || prev.lastName,
              phone: defaultBilling.phone || prev.phone,
              address1: defaultBilling.address_1 || prev.address1,
              address2: defaultBilling.address_2 || prev.address2,
              city: defaultBilling.city || prev.city,
              state: defaultBilling.province || prev.state,
              postalCode: defaultBilling.postal_code || prev.postalCode,
              countryCode: defaultBilling.country_code || prev.countryCode || "IN",
            }));
          }
          if (defaultBilling && defaultShipping) {
            setBillingSame(defaultBilling.id === defaultShipping.id);
          }
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

    const shippingAmount = calculateStatewiseShipping(itemsTotal, shipping.state);

    return {
      subtotal: itemsTotal,
      shipping: shippingAmount,
      total: itemsTotal + shippingAmount,
    };
  }, [cart?.items, shipping.state]);

  const [serverTotals, setServerTotals] = useState<{
    subtotal: number;
    shipping: number;
    total: number;
  } | null>(null);
  const [totalsLoading, setTotalsLoading] = useState(false);
  const [totalWarning, setTotalWarning] = useState<string | null>(null);

  // Calculate wallet coin values (after serverTotals and clientTotals are defined)
  const activeTotals = serverTotals || clientTotals;
  const oweg10Discount =
    customer?.id && oweg10Applied && oweg10Status.canApply
      ? calculateOweg10Discount(activeTotals.subtotal)
      : 0;
  const orderTotal = activeTotals.total;
  const maxRedeemable = getMaxRedeemableCoins(orderTotal);
  const maxUsableCoins = Math.max(0, Math.floor(Math.min(walletBalance, orderTotal, maxRedeemable)));
  // Trust coinsToUse when useCoins is checked, as it was validated at the time of checking.
  // We don't want to re-clamp against walletBalance because it might decrease after deduction on backend.
  const coinDiscount = useCoins ? coinsToUse : 0;
  const payableTotal = Math.max(0, activeTotals.total - coinDiscount - oweg10Discount);

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
            shippingState: shipping.state,
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
        // if (next.total > 0 && clientTotals.total > 0 && delta >= 100) {
        //   setTotalWarning("Order total updated based on server pricing. Please review before paying.");
        // }
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
    shipping.state,
    guestCartId,
    isBuyNow,
    buyNowItem,
    variantFromQuery,
    qtyFromQuery,
    priceFromQuery,
    clientTotals.total,
  ]);

  const formatInr = (value: number) => INR.format(value);

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

    const normalizedShipping = {
      ...shipping,
      email: normalizeEmail(shipping.email),
    };
    const normalizedBilling = {
      ...billing,
      email: normalizeEmail(billing.email),
    };

    setShipping((prev) => (prev.email === normalizedShipping.email ? prev : { ...prev, email: normalizedShipping.email }));
    setBilling((prev) => (prev.email === normalizedBilling.email ? prev : { ...prev, email: normalizedBilling.email }));

    const requestPayload = {
      shipping: normalizedShipping,
      billing: normalizedBilling,
      billingSameAsShipping: billingSame,
      referralCode,
      paymentMethod,
      mode: isBuyNow ? "buy_now" : "cart",
      coinDiscountCode: coinDiscountCode || undefined,
      coinDiscount: useCoins ? coinsToUse : 0,
      oweg10Applied: customer?.id ? oweg10Applied && oweg10Status.canApply : false,
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

    const refundCoinsForOrder = async (orderId: string) => {
      try {
        await fetch("/api/store/wallet/refund-coin-discount-order", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ order_id: orderId, reason: "failed" }),
        });
      } catch (err) {
        console.warn("Failed to trigger immediate coin refund on dismiss", err);
      }
    };

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
        const confirmPayload = {
          medusaOrderId: draft.medusaOrderId,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
          amount_minor: payload.amount,
          currency: payload.currency,
        };

        // Do not block the UI on confirmation. Redirect immediately and let success page poll status.
        void fetch("/api/checkout/razorpay/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(confirmPayload),
          keepalive: true,
        })
          .then((confirmRes) => {
            if (!confirmRes.ok) {
              console.error("razorpay confirm returned non-OK", { status: confirmRes.status });
            }
          })
          .catch((err) => {
            console.error("razorpay confirm failed", err);
          });

        router.push(
          `${RAZORPAY_SUCCESS}?orderId=${encodeURIComponent(draft.medusaOrderId)}&confirming=1`
        );
      },
      modal: {
        ondismiss: async function () {
          await refundCoinsForOrder(draft.medusaOrderId);
          router.push(`${RAZORPAY_FAILED}?orderId=${encodeURIComponent(draft.medusaOrderId)}`);
        },
      },
    });
    rzp.open();
  };

  const performCheckout = async () => {
    if (processing) return;
    if (!isOweg10StatusReady) {
      if (!autoCheckoutNoticeShownRef.current) {
        toast.message("Checking OWEG10 eligibility before checkout...");
        autoCheckoutNoticeShownRef.current = true;
      }
      return;
    }
    autoCheckoutNoticeShownRef.current = false;
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
      setPendingLoginCheckout(true);
    } catch (err) {
      console.error(err);
      setLoginError("Login failed. Please try again.");
    } finally {
      setLoginBusy(false);
    }
  };

  performCheckoutRef.current = performCheckout;

  useEffect(() => {
    if (!pendingLoginCheckout || !customer?.id || !isOweg10StatusReady || processing) return;
    setPendingLoginCheckout(false);
    void performCheckoutRef.current?.();
  }, [pendingLoginCheckout, customer?.id, isOweg10StatusReady, processing]);

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
              {showSaveDefault && customer?.id && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={saveAsDefault}
                    onChange={(e) => setSaveAsDefault(e.target.checked)}
                    disabled={savingAddress}
                  />
                  <span>Save this as default address for next time</span>
                  {savingAddress && <span className="text-xs text-slate-400">Saving...</span>}
                </label>
              )}
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
                  onChange={(e) => setShipping({ ...shipping, email: normalizeEmail(e.target.value) })}
                  onBlur={(e) => setShipping((prev) => ({ ...prev, email: normalizeEmail(e.target.value) }))}
                  inputMode="email"
                  title="Enter a valid email address"
                  readOnly={!!customer?.email}
                  className={customer?.email ? "bg-gray-100 cursor-not-allowed" : undefined}
                  aria-readonly={!!customer?.email}
                />
                <Input
                  required
                  type="tel"
                  placeholder="Phone"
                  value={shipping.phone}
                  onChange={(e) => {
                    setAddressTouched(true);
                    setShipping({ ...shipping, phone: toDigits(e.target.value, 10) });
                  }}
                  inputMode="numeric"
                  pattern="^[0-9]{10}$"
                  maxLength={10}
                  title="Enter a 10-digit phone number"
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
                <div className="relative">
                  <Input
                    required
                    placeholder="State"
                    value={shipping.state}
                    autoComplete="off"
                    onFocus={() => setStateDropdownOpen(true)}
                    onBlur={() => {
                      setTimeout(() => setStateDropdownOpen(false), 120);
                    }}
                    onChange={(e) => {
                      setAddressTouched(true);
                      setStateDropdownOpen(true);
                      setShipping((prev) => ({ ...prev, state: e.target.value }));
                    }}
                  />
                  {stateDropdownOpen && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
                      {shippingStateSuggestions.length > 0 ? (
                        shippingStateSuggestions.map((stateName) => (
                          <button
                            key={stateName}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            onMouseDown={() => {
                              setAddressTouched(true);
                              setShipping((prev) => ({ ...prev, state: stateName }));
                              setStateDropdownOpen(false);
                            }}
                          >
                            {stateName}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-slate-500">No matching state found</div>
                      )}
                    </div>
                  )}
                </div>
                <Input
                  required
                  placeholder="PIN code"
                  value={shipping.postalCode}
                  onChange={(e) => {
                    setAddressTouched(true);
                    setShipping({ ...shipping, postalCode: toDigits(e.target.value, 6) });
                  }}
                  inputMode="numeric"
                  pattern="^[0-9]{6}$"
                  maxLength={6}
                  title="Enter a 6-digit PIN code"
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
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setBillingSame(checked);
                      if (checked) {
                        setBilling({ ...shipping });
                      }
                    }}
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
                    onChange={(e) => setBilling({ ...billing, email: normalizeEmail(e.target.value) })}
                    onBlur={(e) => setBilling((prev) => ({ ...prev, email: normalizeEmail(e.target.value) }))}
                    inputMode="email"
                    title="Enter a valid email address"
                    readOnly={!!customer?.email}
                    className={customer?.email ? "bg-gray-100 cursor-not-allowed" : undefined}
                    aria-readonly={!!customer?.email}
                  />
                  <Input
                    required
                    type="tel"
                    placeholder="Phone"
                    value={billing.phone}
                    onChange={(e) => setBilling({ ...billing, phone: toDigits(e.target.value, 10) })}
                    inputMode="numeric"
                    pattern="^[0-9]{10}$"
                    maxLength={10}
                    title="Enter a 10-digit phone number"
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
                  <div className="relative">
                    <Input
                      required
                      placeholder="State"
                      value={billing.state}
                      autoComplete="off"
                      onFocus={() => setBillingStateDropdownOpen(true)}
                      onBlur={() => {
                        setTimeout(() => setBillingStateDropdownOpen(false), 120);
                      }}
                      onChange={(e) => {
                        setBillingStateDropdownOpen(true);
                        setBilling((prev) => ({ ...prev, state: e.target.value }));
                      }}
                    />
                    {billingStateDropdownOpen && (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
                        {billingStateSuggestions.length > 0 ? (
                          billingStateSuggestions.map((stateName) => (
                            <button
                              key={stateName}
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              onMouseDown={() => {
                                setBilling((prev) => ({ ...prev, state: stateName }));
                                setBillingStateDropdownOpen(false);
                              }}
                            >
                              {stateName}
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-slate-500">No matching state found</div>
                        )}
                      </div>
                    )}
                  </div>
                  <Input
                    required
                    placeholder="PIN code"
                    value={billing.postalCode}
                    onChange={(e) => setBilling({ ...billing, postalCode: toDigits(e.target.value, 6) })}
                    inputMode="numeric"
                    pattern="^[0-9]{6}$"
                    maxLength={6}
                    title="Enter a 6-digit PIN code"
                  />
                </div>
              )}
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
                          unoptimized
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
              {referralLoading ? (
                <p className="text-sm text-slate-500">Loading referral code...</p>
              ) : referralCodeApplied && referralCode ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 text-lg">✓</span>
                    <div>
                      <p className="text-sm font-medium text-green-800">Referral code applied and locked</p>
                      <p className="text-xs text-green-600 font-semibold">{referralCode} {referralAgentName ? `(${referralAgentName})` : ""}</p>
                    </div>
                  </div>
                  <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded">Locked</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter referral code (optional)"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    className="uppercase flex-1"
                  />
                  <Button 
                    type="button" 
                    onClick={handleApplyReferral}
                    disabled={referralValidating || !referralCode.trim()}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {referralValidating ? "Checking..." : "Apply"}
                  </Button>
                </div>
              )}
            </section>

            {/* WALLET COINS SECTION */}
            {customer && (
              <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <img src="/uploads/coin/oweg_bag.png" alt="Wallet" className="w-8 h-8" />
                  Wallet Coins
                </h2>
                {walletLoading ? (
                  <p className="text-sm text-slate-500">Loading wallet...</p>
                ) : walletBalance > 0 ? (
                  <div className="space-y-3">
                    {/* Available Balance */}
                    {walletBalance > 0 && (
                      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <div>
                          <p className="text-sm font-medium text-amber-800">Available Balance</p>
                          <p className="text-lg font-bold text-amber-700">{Math.round(walletBalance)} coins</p>
                          <p className="text-xs text-amber-600">1 coin = ₹1 discount</p>
                        </div>
                        {walletExpiring > 0 && (
                          <div className="text-right">
                            <p className="text-xs text-red-500">⏰ {Math.round(walletExpiring)} expiring soon</p>
                          </div>
                        )}
                      </div>
                    )}
                    {walletAdjustmentMessage && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        {walletAdjustmentMessage}
                      </div>
                    )}



                    {/* Redemption Limit Info */}
                    <div className="text-xs text-slate-500 bg-slate-50 rounded p-2">
                      <p>Max redeemable for this order: <strong>{maxRedeemable} coins</strong></p>
                      <p className="text-slate-400">Limit based on order value (₹{orderTotal.toFixed(0)})</p>
                    </div>

                    <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={useCoins}
                        onChange={async (e) => {
                          const isChecked = e.target.checked;
                          const hasRealCart = Boolean(cart?.id && cart.id !== "buy-now");

                          if (isChecked) {
                            if (!customer?.id) {
                              toast.error("Please sign in to redeem wallet coins.");
                              setUseCoins(false);
                              setCoinsToUse(0);
                              setCoinDiscountCode(null);
                              return;
                            }

                            // User wants to use coins
                            const maxCoins = maxUsableCoins;
                            if (maxCoins <= 0) {
                              toast.error("Add items to checkout before applying coins.");
                              setUseCoins(false);
                              setCoinsToUse(0);
                              setCoinDiscountCode(null);
                              return;
                            }
                            const coinsInMinorUnits = maxCoins * 100; // Convert coins to minor units

                            setApplyingCoinDiscount(true);
                            try {
                              // Step 1: Create Medusa discount code
                              const discountRes = await fetch('/api/store/wallet/create-coin-discount', {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({
                                  customer_id: customer?.id,
                                  cart_id: hasRealCart ? cart?.id : undefined,
                                  coin_amount: coinsInMinorUnits
                                })
                              });

                              if (!discountRes.ok) {
                                const error = await discountRes.json();
                                throw new Error(error.error || 'Failed to create discount');
                              }

                              const discountData = await discountRes.json();
                              const { discount_code } = discountData;

                              // Step 2: Apply discount to Medusa cart only for cart checkout
                              if (hasRealCart) {
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
                            if (coinDiscountCode) {
                              setApplyingCoinDiscount(true);
                              try {
                                // Remove discount from cart only for cart checkout
                                if (hasRealCart) {
                                  await fetch(`/api/store/cart/apply-discount?cart_id=${cart?.id}&discount_code=${coinDiscountCode}`, {
                                    method: 'DELETE'
                                  });
                                }

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
                        className="w-4 h-4 text-green-600"
                        disabled={applyingCoinDiscount || !walletCanRedeem || maxUsableCoins <= 0}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">
                          Use {maxUsableCoins} coins
                        </p>
                        <p className="text-xs text-green-600">
                          Save ₹{maxUsableCoins}
                        </p>
                        {applyingCoinDiscount && (
                          <p className="text-xs text-slate-500 mt-1">Applying discount...</p>
                        )}
                      </div>
                    </label>

                    {useCoins && (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                        <span className="text-green-600">✓</span>
                        <p className="text-sm text-green-800">
                          Discount of <strong>₹{coinDiscount.toFixed(2)}</strong> will be applied
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">
                    <p>No coins available yet.</p>
                    <p className="text-xs mt-1 flex items-center gap-1">Earn 2% coins on every purchase! <img src="/uploads/coin/oweg_bag.png" alt="coins" className="w-4 h-4 inline" /></p>
                  </div>
                )}
              </section>
            )}
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
              {customer ? (
                oweg10Status.canApply ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={oweg10Applied}
                        onChange={(e) => setOweg10Applied(e.target.checked)}
                        className="mt-1 h-4 w-4 text-emerald-600"
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-emerald-900">
                          Apply {OWEG10_CODE} for 10% off
                        </p>
                      </div>
                    </label>
                  </div>
                ) : oweg10Status.pending ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    {OWEG10_CODE} is already being processed for this account. Complete the current checkout or wait a few minutes.
                  </div>
                ) : null
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Sign in to unlock the one-time {OWEG10_CODE} 10% offer.
                </div>
              )}
              <div className="space-y-2 text-sm text-slate-700">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold">{formatInr(activeTotals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-semibold">
                    {activeTotals.shipping === 0 ? "Free" : formatInr(activeTotals.shipping)}
                  </span>
                </div>
                {oweg10Discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>{OWEG10_CODE} discount</span>
                    <span className="font-semibold">-{formatInr(oweg10Discount)}</span>
                  </div>
                )}
                {/* Coin Discount Line */}
                {useCoins && coinDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span><img src="/uploads/coin/coin.png" alt="Coin" className="w-5 h-5 inline-block object-contain mr-1" /> Coin Discount</span>
                    <span className="font-semibold">-{formatInr(coinDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-semibold text-slate-900 pt-2 border-t">
                  <span>Total</span>
                  <span>{formatInr(payableTotal)}</span>
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
                {processing ? "Processing Payment…" : `Pay securely (${formatInr(payableTotal)})`}
              </Button>
              {/* {isRazorpayTest && (
                // <p className="text-xs text-slate-500 text-center">
                //   Payment is processed in Razorpay TEST MODE. Do not use real credentials.
                // </p>
              )} */}
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





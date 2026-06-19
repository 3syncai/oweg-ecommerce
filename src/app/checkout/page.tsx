"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthProvider";
import { buildSignupUrl } from "@/lib/auth-redirect";
import { calculateOweg10Discount, OWEG10_CODE } from "@/lib/oweg10-shared";
import {
  OwegPaymentForm,
  type OwegPaymentFormHandle,
} from "@/components/checkout/OwegPaymentForm";
import {
  loadRazorpayCustomScript,
  prefetchRazorpayConnections,
  submitCustomRazorpayPayment,
  type RazorpaySuccessResponse,
} from "@/lib/razorpay-custom-client";
import { getSiteOrigin } from "@/lib/razorpay";
import { calculateStatewiseShipping } from "@/lib/shipping-rules";

type CartItem = {
  id: string;
  title: string;
  quantity: number;
  unit_price: number;
  thumbnail?: string;
  product_id?: string;
  variant?: { product_id?: string } | null;
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
  razorpay?: {
    orderId: string;
    key: string;
    amount: number;
    currency: string;
  };
  codConfirmed?: boolean;
  codFast?: boolean;
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

function razorpayAmountToMinor(amount: number, fallbackRupees: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return Math.round(Math.max(0, fallbackRupees) * 100);
  }
  // Razorpay API returns paise; draft-order embeds rupees when amount < 10000
  if (amount >= 10000) return Math.round(amount);
  return Math.round(amount * 100);
}

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
  const [checkoutAfterLoginIntent, setCheckoutAfterLoginIntent] = useState(false);
  const autoCheckoutNoticeShownRef = useRef(false);
  const performCheckoutRef = useRef<(() => Promise<void>) | null>(null);
  const paymentFormRef = useRef<OwegPaymentFormHandle>(null);

  const [referralCode, setReferralCode] = useState("");
  const [referralCodeApplied, setReferralCodeApplied] = useState(false); // Track if auto-applied
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralValidating, setReferralValidating] = useState(false);
  const [referralAgentName, setReferralAgentName] = useState("");

  // Customer-affiliate (separate, customer-shared "?ref=" code) state
  const [affiliateCode, setAffiliateCode] = useState("");
  const [affiliateCodeApplied, setAffiliateCodeApplied] = useState(false);
  const [affiliateValidating, setAffiliateValidating] = useState(false);
  const [affiliateName, setAffiliateName] = useState("");
  const [affiliateError, setAffiliateError] = useState<string | null>(null);

  // Tracks whether the inbound ?ref=CODE has been routed to the correct
  // section (Referral vs. Affiliate) so we don't re-run the routing logic
  // after state updates.
  const inboundRefRoutedRef = useRef(false);

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

  // Auto-route an inbound ?ref=CODE (from URL or persisted localStorage) to
  // the correct section:
  //   - Agent codes (sales executive, branch_admin, ASM, state_admin,
  //     affiliate_user) → Referral code section. For logged-in customers we
  //     also lock the code on their profile so it survives the session.
  //   - Customer-shared affiliate codes → Affiliate code section (existing
  //     behavior, validated when the user proceeds or via the Apply button).
  // For logged-in users we wait for the customer's saved-referral lookup to
  // finish before routing, so an already-locked code is never overridden.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (inboundRefRoutedRef.current) return;
    if (customer?.id && referralLoading) return;

    const fromUrl = searchParams?.get("ref")?.trim() || "";
    let stored = "";
    try {
      stored = window.localStorage.getItem("oweg_affiliate_ref") || "";
    } catch {
      /* ignore */
    }
    const code = (fromUrl || stored).trim().toUpperCase();

    inboundRefRoutedRef.current = true;
    if (!code) return;

    // If the customer already has a locked referral code, keep it and just
    // clear the inbound storage so the affiliate field doesn't pick it up.
    if (referralCodeApplied) {
      try {
        window.localStorage.removeItem("oweg_affiliate_ref");
        document.cookie = "oweg_affiliate_ref=; Max-Age=0; path=/; SameSite=Lax";
      } catch {
        /* ignore */
      }
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const referralRes = await fetch(
          `/api/store/validate-referral?code=${encodeURIComponent(code)}`,
          { cache: "no-store" }
        );
        const referralData = await referralRes.json().catch(() => ({} as { valid?: boolean; agent_name?: string }));
        if (cancelled) return;

        if (referralData?.valid) {
          // Agent referral code → populate the Referral code section.
          setReferralCode(code);
          setReferralAgentName(referralData.agent_name || "");

          if (customer?.id) {
            try {
              const saveRes = await fetch("/api/store/save-referral", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer_id: customer.id, referral_code: code }),
              });
              if (cancelled) return;
              const saveData = await saveRes.json().catch(() => ({} as { existing_code?: string }));
              if (saveRes.ok) {
                setReferralCodeApplied(true);
                toast.success(
                  referralData.agent_name
                    ? `Referral applied: ${referralData.agent_name}`
                    : "Referral code applied"
                );
              } else if (saveData?.existing_code) {
                // Customer already had a different locked code — surface that.
                setReferralCode(saveData.existing_code);
                setReferralCodeApplied(true);
              }
            } catch (saveErr) {
              console.warn("[checkout] save-referral failed", saveErr);
            }
          } else {
            // Guest checkout — lock the field visually so the code travels
            // with the order when they finish checkout.
            setReferralCodeApplied(true);
            toast.success(
              referralData.agent_name
                ? `Referral applied: ${referralData.agent_name}`
                : "Referral code applied"
            );
          }

          // Clear the affiliate storage so the Affiliate code section
          // doesn't also pick this same code up.
          try {
            window.localStorage.removeItem("oweg_affiliate_ref");
            document.cookie = "oweg_affiliate_ref=; Max-Age=0; path=/; SameSite=Lax";
          } catch {
            /* ignore */
          }
          return;
        }

        // Not an agent code → fall back to the customer-affiliate section.
        if (!affiliateCode && !affiliateCodeApplied) {
          setAffiliateCode(code);
        }
      } catch (err) {
        console.warn("[checkout] inbound ref validation failed", err);
        if (cancelled) return;
        if (!affiliateCode && !affiliateCodeApplied) {
          setAffiliateCode(code);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, referralLoading]);

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

  // Handler to apply the customer-affiliate (?ref=) code. Independent from
  // the existing referral-code flow above.
  const handleApplyAffiliate = async () => {
    const trimmed = affiliateCode.trim().toUpperCase();
    if (!trimmed) return;
    setAffiliateValidating(true);
    setAffiliateError(null);
    try {
      const productIds = Array.from(
        new Set(
          (cart?.items || [])
            .map((it) => it.product_id || it.variant?.product_id || "")
            .filter(Boolean)
        )
      );

      const params = new URLSearchParams({ code: trimmed });
      if (productIds.length > 0) params.set("product_ids", productIds.join(","));
      const headers: Record<string, string> = {};
      if (customer?.id) headers["x-customer-id"] = customer.id;

      const res = await fetch(
        `/api/customer-affiliate/validate?${params.toString()}`,
        { headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.valid) {
        setAffiliateError(data?.message || data?.error || "Invalid affiliate code.");
        toast.error(data?.message || "Invalid affiliate code.");
        setAffiliateCodeApplied(false);
        return;
      }

      if (customer?.id && data.affiliate_customer_id === customer.id) {
        setAffiliateError("You can't use your own affiliate code.");
        toast.error("You can't use your own affiliate code.");
        setAffiliateCodeApplied(false);
        return;
      }

      setAffiliateName(data.affiliate_name || "");

      if (customer?.id) {
        try {
          await fetch("/api/customer-affiliate/track-referral", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              refer_code: trimmed,
              referred_customer_id: customer.id,
              referred_email: customer.email || null,
              referred_name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
            }),
          });
        } catch (trackErr) {
          console.warn("[affiliate] track-referral failed", trackErr);
        }
      }

      setAffiliateCode(trimmed);
      setAffiliateCodeApplied(true);

      // The validate endpoint refuses any cart that contains a product the
      // customer has already used with this same code, so by the time we get
      // here every product in the cart is eligible. Nothing extra to flag.
      toast.success(
        data.affiliate_name
          ? `Affiliate code applied (${data.affiliate_name})`
          : "Affiliate code applied"
      );
    } catch (err) {
      console.error(err);
      setAffiliateError("Could not validate affiliate code. Please try again.");
      toast.error("Error applying affiliate code.");
    } finally {
      setAffiliateValidating(false);
    }
  };

  const handleClearAffiliate = () => {
    setAffiliateCode("");
    setAffiliateCodeApplied(false);
    setAffiliateName("");
    setAffiliateError(null);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("oweg_affiliate_ref");
        document.cookie = "oweg_affiliate_ref=; Max-Age=0; path=/; SameSite=Lax";
      }
    } catch {
      /* ignore */
    }
  };

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
  // Trust coinsToUse when useCoins is checked (coins are only deducted after payment succeeds).
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
          }),
        });

        if (!res.ok) throw new Error("order summary unavailable");
        const data = await res.json();
        const next = normalizeTotals(data);
        setServerTotals(next);
        const delta = Math.abs(next.total - clientTotals.total);
        if (next.total > 0 && clientTotals.total > 0 && delta >= 100) {
          setTotalWarning("Review Before you pay");
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
    shipping.state,
    guestCartId,
    isBuyNow,
    buyNowItem,
    variantFromQuery,
    qtyFromQuery,
    priceFromQuery,
    clientTotals.total,
  ]);

  useEffect(() => {
    if (paymentMethod !== "razorpay") return;
    prefetchRazorpayConnections();
    void loadRazorpayCustomScript().catch(() => undefined);
  }, [paymentMethod]);

  const formatInr = (value: number) => INR.format(value);

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
      void saveDefaultAddress();
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

  const finalizeCodCheckout = (draft: DraftOrderResponse) => {
    void fetch("/api/checkout/cod", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ medusaOrderId: draft.medusaOrderId }),
      keepalive: true,
    }).catch((err) => {
      console.error("cod background confirm failed", err);
    });
    setProcessing(false);
    router.push(
      `${RAZORPAY_SUCCESS}?orderId=${encodeURIComponent(draft.medusaOrderId)}&confirming=1&cod=1`
    );
  };

  const refundCoinsForOrder = async (orderId: string) => {
    try {
      await fetch("/api/store/wallet/refund-coin-discount-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order_id: orderId, reason: "failed" }),
      });
    } catch (err) {
      console.warn("Failed to trigger coin refund on payment failure", err);
    }
  };

  const confirmRazorpayPayment = async (
    draft: DraftOrderResponse,
    response: RazorpaySuccessResponse,
    amountMinor: number,
    currency: string
  ) => {
    const res = await fetch("/api/checkout/razorpay/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        medusaOrderId: draft.medusaOrderId,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
        amount_minor: amountMinor,
        currency,
      }),
    });
    if (!res.ok) {
      console.error("razorpay confirm failed", await res.text().catch(() => ""));
    }
  };

  const handleCustomRazorpay = async (draft: DraftOrderResponse, payableRupees: number) => {
    const paymentPayload = paymentFormRef.current?.getPaymentPayload();
    const validationError = paymentFormRef.current?.getValidationError();
    if (!paymentPayload || validationError) {
      throw new Error(validationError || "Complete payment details before paying");
    }

    let createData: {
      key: string;
      amount: number;
      currency: string;
      orderId: string;
    };

    if (draft.razorpay?.orderId && draft.razorpay.key) {
      createData = {
        key: draft.razorpay.key,
        amount: draft.razorpay.amount,
        currency: draft.razorpay.currency,
        orderId: draft.razorpay.orderId,
      };
    } else {
      const createRes = await fetch("/api/create-razorpay-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          medusaOrderId: draft.medusaOrderId,
          amount: payableRupees > 0 ? payableRupees : draft.total,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || "Unable to create payment");
      }
      createData = await createRes.json();
    }

    const amountMinor = razorpayAmountToMinor(
      createData.amount,
      payableRupees > 0 ? payableRupees : draft.total
    );
    if (amountMinor <= 0) {
      throw new Error("Invalid payment amount. Please refresh and try again.");
    }
    const origin = getSiteOrigin(typeof window !== "undefined" ? window.location.origin : undefined);
    const callbackUrl = `${origin}/api/checkout/razorpay/callback?orderId=${encodeURIComponent(
      draft.medusaOrderId
    )}`;

    const email = shipping.email || billing.email;
    const contact = shipping.phone || billing.phone;

    await submitCustomRazorpayPayment({
      key: createData.key,
      amountMinor,
      currency: createData.currency,
      orderId: createData.orderId,
      medusaOrderId: draft.medusaOrderId,
      email,
      contact,
      callbackUrl,
      payload: paymentPayload,
      onSuccess: async (response) => {
        await confirmRazorpayPayment(draft, response, amountMinor, createData.currency);
        router.push(
          `${RAZORPAY_SUCCESS}?orderId=${encodeURIComponent(draft.medusaOrderId)}&confirming=1`
        );
      },
      onFailure: async () => {
        await fetch("/api/checkout/payment-failed", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ medusaOrderId: draft.medusaOrderId }),
        }).catch(() => undefined);
        await refundCoinsForOrder(draft.medusaOrderId);
        router.push(`${RAZORPAY_FAILED}?orderId=${encodeURIComponent(draft.medusaOrderId)}`);
      },
    });

    setProcessing(false);
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

      const [draft] = await Promise.all([
        createDraftOrder(),
        paymentMethod === "razorpay" ? loadRazorpayCustomScript() : Promise.resolve(),
      ]);
      if (paymentMethod === "cod") {
        finalizeCodCheckout(draft);
        return;
      }
      await handleCustomRazorpay(draft, payableTotal);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Checkout failed");
      setProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) {
      setCheckoutAfterLoginIntent(true);
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
      if (checkoutAfterLoginIntent) {
        setPendingLoginCheckout(true);
      } else {
        setPendingLoginCheckout(false);
      }
      setCheckoutAfterLoginIntent(false);
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
            {!customer ? (
              <section className="bg-white rounded-xl shadow-sm border p-5 md:p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Login required to continue checkout</h2>
                <p className="text-sm text-slate-600">
                  Please sign in first.
                </p>
                <Button
                  type="button"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    setCheckoutAfterLoginIntent(false);
                    setLoginModalOpen(true);
                  }}
                >
                  Login to continue
                </Button>
              </section>
            ) : (
              <>
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
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Payment</h2>
                <Image
                  src="/razorpay_logo.png"
                  alt="Secured by Razorpay"
                  width={88}
                  height={24}
                  unoptimized
                  className="opacity-80"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("razorpay")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    paymentMethod === "razorpay"
                      ? "border-green-600 bg-green-50 text-green-800"
                      : "border-slate-200 text-slate-700 hover:border-green-400"
                  }`}
                >
                  Pay online
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cod")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    paymentMethod === "cod"
                      ? "border-green-600 bg-green-50 text-green-800"
                      : "border-slate-200 text-slate-700 hover:border-green-400"
                  }`}
                >
                  Cash on delivery
                </button>
              </div>

              <OwegPaymentForm
                ref={paymentFormRef}
                enabled={paymentMethod === "razorpay"}
                prefill={{
                  name: `${shipping.firstName} ${shipping.lastName}`.trim(),
                  email: shipping.email,
                  contact: shipping.phone,
                }}
              />
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

            {/* AFFILIATE CODE (customer-shared "?ref=") — independent of the
                referral code section above. */}
            <section className="bg-white rounded-xl shadow-sm border p-4 md:p-6 space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Do you have an affiliate code?</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Got a code from a friend or a shared OWEG product link? Add it here so they get rewarded for the referral.
                </p>
              </div>

              {affiliateCodeApplied && affiliateCode ? (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 text-lg">✓</span>
                    <div>
                      <p className="text-sm font-medium text-emerald-800">Affiliate code applied</p>
                      <p className="text-xs text-emerald-700 font-mono font-semibold">
                        {affiliateCode}{affiliateName ? ` · ${affiliateName}` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearAffiliate}
                    className="text-xs text-emerald-700 hover:text-emerald-900 underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter affiliate code (optional)"
                      value={affiliateCode}
                      onChange={(e) => {
                        setAffiliateCode(e.target.value.toUpperCase());
                        if (affiliateError) setAffiliateError(null);
                      }}
                      className="uppercase flex-1 font-mono tracking-wider"
                      maxLength={32}
                    />
                    <Button
                      type="button"
                      onClick={handleApplyAffiliate}
                      disabled={affiliateValidating || !affiliateCode.trim()}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {affiliateValidating ? "Checking..." : "Apply"}
                    </Button>
                  </div>
                  {affiliateError ? (
                    <p className="text-xs text-red-600">{affiliateError}</p>
                  ) : null}
                </>
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
                        onChange={(e) => {
                          const isChecked = e.target.checked;

                          if (isChecked) {
                            if (!customer?.id) {
                              toast.error("Please sign in to redeem wallet coins.");
                              return;
                            }
                            const maxCoins = maxUsableCoins;
                            if (maxCoins <= 0) {
                              toast.error("Add items to checkout before applying coins.");
                              return;
                            }
                            setUseCoins(true);
                            setCoinsToUse(maxCoins);
                          } else {
                            setUseCoins(false);
                            setCoinsToUse(0);
                          }
                        }}
                        className="w-4 h-4 text-green-600"
                        disabled={!walletCanRedeem || maxUsableCoins <= 0}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">
                          Use {maxUsableCoins} coins
                        </p>
                        <p className="text-xs text-green-600">
                          Save ₹{maxUsableCoins}
                        </p>
                      </div>
                    </label>

                    {useCoins && (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                        <span className="text-green-600">✓</span>
                        <p className="text-sm text-green-800">
                          <strong>₹{coinDiscount.toFixed(2)}</strong> will be deducted from your wallet after payment succeeds
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
              </>
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
                type={customer ? "submit" : "button"}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
                onClick={
                  customer
                    ? undefined
                    : () => {
                        setCheckoutAfterLoginIntent(true);
                        setLoginModalOpen(true);
                      }
                }
                disabled={
                  processing ||
                  (!isBuyNow && !cartItems.length) ||
                  (isBuyNow && !buyNowItem && !variantFromQuery)
                }
              >
                {processing ? "Processing Payment…" : `Pay securely (${formatInr(payableTotal)})`}
              </Button>
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
                  setCheckoutAfterLoginIntent(false);
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
                <Link
                  href={buildSignupUrl(
                    `/checkout${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`
                  )}
                  className="text-emerald-700 font-semibold"
                >
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





"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthProvider";
import { usePreferences } from "@/hooks/usePreferences";
import { buildPreferenceSlug } from "@/lib/personalization";

type Order = {
  id: string;
  display_id?: number;
  created_at?: string;
  currency_code?: string;
  total?: number;
  payment_status?: string;
  fulfillment_status?: string;
  items?: Array<{
    id: string;
    title?: string;
    quantity?: number;
  }>;
};

type CustomerAddress = {
  id?: string;
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

type WalletSnapshot = {
  balance?: number;
  display_balance?: number;
  actual_balance?: number;
  pending_adjustment?: number;
  adjustment_message?: string | null;
  transactions?: Array<{
    id?: string;
    amount?: number;
    status?: string;
    created_at?: string;
    type?: string;
  }>;
};

type AddressForm = {
  id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
};

type CustomerHubProps = {
  onLogout?: () => void;
  layout?: "dropdown" | "page";
};

const emptyAddressForm: AddressForm = {
  firstName: "",
  lastName: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postalCode: "",
  countryCode: "IN",
};

const formatDate = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatCurrency = (value?: number, currency?: string) => {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: (currency || "INR").toUpperCase(),
    maximumFractionDigits: 0,
  }).format(value);
};

const statusLabel = (payment?: string, fulfillment?: string) => {
  if (fulfillment === "shipped") return "Shipped";
  if (fulfillment === "delivered") return "Delivered";
  if (payment === "awaiting" || payment === "requires_action") return "Payment pending";
  if (payment === "captured" || payment === "paid") return "Processing";
  return "Processing";
};

const formatAddressLine = (address?: AddressForm) => {
  if (!address) return "Add address";
  const parts = [
    address.address1,
    address.address2,
    address.city,
    address.state,
    address.postalCode,
  ]
    .map((part) => (part || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "Add address";
};

const preferenceOptions = {
  categories: [
    "Computer & Mobile Accessories",
    "Home Decor",
    "Kitchen & Dining",
    "Furniture",
    "Lighting",
    "Garden",
    "Sports & Fitness",
    "Personal Care",
  ],
  brands: [
    "Samsung",
    "LG",
    "Philips",
    "Whirlpool",
    "Bosch",
    "Havells",
    "Godrej",
    "Panasonic",
  ],
  productTypes: [
    "Appliances",
    "Electronics",
    "Furniture",
    "Decor",
    "Tools",
    "Outdoor",
    "Fitness",
    "Storage",
  ],
};

const normalizePrefList = (list: string[]) => {
  const seen = new Set<string>();
  return list.filter((item) => {
    const slug = buildPreferenceSlug(item);
    if (!slug || seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
};

export default function CustomerHub({ onLogout, layout = "dropdown" }: CustomerHubProps) {
  const { customer, refresh } = useAuth();
  const { preferences, savePreferences, saving: savingPreferences } = usePreferences();

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const [shipping, setShipping] = useState<AddressForm>(emptyAddressForm);
  const [billing, setBilling] = useState<AddressForm>(emptyAddressForm);
  const [shippingId, setShippingId] = useState<string | undefined>(undefined);
  const [billingId, setBillingId] = useState<string | undefined>(undefined);
  const [editingShipping, setEditingShipping] = useState(false);
  const [editingBilling, setEditingBilling] = useState(false);
  const [savingShipping, setSavingShipping] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [prefCategories, setPrefCategories] = useState<string[]>([]);
  const [prefBrands, setPrefBrands] = useState<string[]>([]);
  const [prefTypes, setPrefTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!customer?.id) return;
    setPrefCategories(preferences?.categories || []);
    setPrefBrands(preferences?.brands || []);
    setPrefTypes(preferences?.productTypes || []);
  }, [customer?.id, preferences?.brands, preferences?.categories, preferences?.productTypes]);

  useEffect(() => {
    if (!customer?.id) return;
    const loadOrders = async () => {
      setOrdersLoading(true);
      try {
        const fetchOrders = () =>
          fetch("/api/medusa/orders?limit=3&offset=0", {
            cache: "no-store",
            credentials: "include",
          });

        let res = await fetchOrders();
        if (res.status === 401) {
          await refresh();
          res = await fetchOrders();
        }
        if (!res.ok) throw new Error("Unable to load orders");
        const data = await res.json();
        setOrders((data.orders || []) as Order[]);
        setOrdersError(null);
      } catch {
        setOrdersError("Could not load orders.");
      } finally {
        setOrdersLoading(false);
      }
    };
    void loadOrders();
  }, [customer?.id, refresh]);

  useEffect(() => {
    if (!customer?.id) return;
    const loadAddresses = async () => {
      try {
        const fetchAddresses = () =>
          fetch("/api/medusa/customer-addresses", {
            cache: "no-store",
            credentials: "include",
          });

        let res = await fetchAddresses();
        if (res.status === 401) {
          await refresh();
          res = await fetchAddresses();
        }
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.addresses || data?.customer?.addresses || []) as CustomerAddress[];
        const defaultShipping = list.find((addr) => addr.is_default_shipping) || list[0];
        const defaultBilling = list.find((addr) => addr.is_default_billing) || defaultShipping;

        if (defaultShipping) {
          setShippingId(defaultShipping.id);
          setShipping({
            id: defaultShipping.id,
            firstName: defaultShipping.first_name || "",
            lastName: defaultShipping.last_name || "",
            phone: defaultShipping.phone || "",
            address1: defaultShipping.address_1 || "",
            address2: defaultShipping.address_2 || "",
            city: defaultShipping.city || "",
            state: defaultShipping.province || "",
            postalCode: defaultShipping.postal_code || "",
            countryCode: defaultShipping.country_code || "IN",
          });
        }
        if (defaultBilling) {
          setBillingId(defaultBilling.id);
          setBilling({
            id: defaultBilling.id,
            firstName: defaultBilling.first_name || "",
            lastName: defaultBilling.last_name || "",
            phone: defaultBilling.phone || "",
            address1: defaultBilling.address_1 || "",
            address2: defaultBilling.address_2 || "",
            city: defaultBilling.city || "",
            state: defaultBilling.province || "",
            postalCode: defaultBilling.postal_code || "",
            countryCode: defaultBilling.country_code || "IN",
          });
        }
      } catch (error) {
        console.warn("Failed to load addresses", error);
      }
    };
    void loadAddresses();
  }, [customer?.id, refresh]);

  useEffect(() => {
    if (!customer?.id) return;
    const loadWallet = async () => {
      setWalletLoading(true);
      try {
        const res = await fetch("/api/store/wallet", {
          headers: { "x-customer-id": customer.id },
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as WalletSnapshot;
          setWallet(data);
        }
      } catch (error) {
        console.error("Failed to fetch wallet", error);
      } finally {
        setWalletLoading(false);
      }
    };
    void loadWallet();
  }, [customer?.id]);

  const earnedCoins = useMemo(() => {
    const list = wallet?.transactions || [];
    return list.reduce((sum, txn) => (txn.amount && txn.amount > 0 ? sum + txn.amount : sum), 0);
  }, [wallet?.transactions]);

  const spentCoins = useMemo(() => {
    const list = wallet?.transactions || [];
    return list.reduce((sum, txn) => (txn.amount && txn.amount < 0 ? sum + Math.abs(txn.amount) : sum), 0);
  }, [wallet?.transactions]);

  const saveAddress = async (type: "shipping" | "billing") => {
    const isShipping = type === "shipping";
    const form = isShipping ? shipping : billing;
    const id = isShipping ? shippingId : billingId;
    const setSaving = isShipping ? setSavingShipping : setSavingBilling;
    const setEditing = isShipping ? setEditingShipping : setEditingBilling;

    const payload = {
      first_name: form.firstName,
      last_name: form.lastName,
      phone: form.phone,
      address_1: form.address1,
      address_2: form.address2,
      city: form.city,
      province: form.state,
      postal_code: form.postalCode,
      country_code: form.countryCode || "IN",
      ...(isShipping ? { is_default_shipping: true } : { is_default_billing: true }),
    };

    try {
      setSaving(true);
      const res = await fetch(
        id ? `/api/medusa/customer-addresses/${encodeURIComponent(id)}` : "/api/medusa/customer-addresses",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error("Unable to save address");
      toast.success(isShipping ? "Shipping address saved." : "Billing address saved.");
      setEditing(false);
    } catch (error) {
      console.error("Failed to save address", error);
      toast.error("Unable to save address right now.");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Enter your current and new password.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    try {
      setSavingPassword(true);
      const res = await fetch("/api/medusa/customers/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Unable to update password.");
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated. Please sign in again.");
      if (onLogout) {
        onLogout();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update password.";
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      await savePreferences({
        categories: prefCategories,
        brands: prefBrands,
        productTypes: prefTypes,
      });
      toast.success("Preferences saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save preferences.";
      toast.error(message);
    }
  };

  const togglePreference = (
    value: string,
    list: string[],
    setList: Dispatch<SetStateAction<string[]>>
  ) => {
    setList((prev) => {
      const has = prev.some((item) => buildPreferenceSlug(item) === buildPreferenceSlug(value));
      const next = has ? prev.filter((item) => buildPreferenceSlug(item) !== buildPreferenceSlug(value)) : [...prev, value];
      return normalizePrefList(next);
    });
  };

  const removePreference = (
    value: string,
    setList: Dispatch<SetStateAction<string[]>>
  ) => {
    setList((prev) => prev.filter((item) => buildPreferenceSlug(item) !== buildPreferenceSlug(value)));
  };

  const customerName =
    customer?.first_name || customer?.last_name
      ? `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim()
      : customer?.email || "Customer";

  const containerClass =
    layout === "dropdown" ? "max-h-[70vh] overflow-y-auto" : "";
  const sectionClass = layout === "dropdown" ? "px-3 py-4 border-b border-gray-200" : "py-5 border-b border-gray-200";

  return (
    <div className={containerClass}>
      <div className={sectionClass}>
        <p className="text-lg font-semibold text-gray-900">{customerName}</p>
        <p className="text-base text-gray-600">{customer?.email || ""}</p>
        {customer?.phone && <p className="text-base text-gray-600">{customer.phone}</p>}
      </div>

      <div className={`${sectionClass} grid gap-4 md:grid-cols-2`}>
        <div className="rounded-md border border-gray-200 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-base font-semibold text-gray-900">Login credentials</p>
          <div className="mt-2 space-y-2">
            <Input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button
              size="sm"
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700 text-base"
              onClick={handlePasswordSave}
              disabled={savingPassword}
            >
              {savingPassword ? "Saving..." : "Update password"}
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-base font-semibold text-gray-900">Preferences</p>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Chosen</p>
              <div className="flex flex-wrap gap-2">
                {normalizePrefList([...prefCategories, ...prefBrands, ...prefTypes]).length === 0 && (
                  <span className="text-sm text-gray-500">No preferences selected yet.</span>
                )}
                {prefCategories.map((item) => (
                  <span key={`cat-${buildPreferenceSlug(item)}`} className="relative px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium">
                    {item}
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-600 text-white text-xs leading-none flex items-center justify-center"
                      onClick={() => removePreference(item, setPrefCategories)}
                      aria-label={`Remove ${item}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {prefBrands.map((item) => (
                  <span key={`brand-${buildPreferenceSlug(item)}`} className="relative px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium">
                    {item}
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-600 text-white text-xs leading-none flex items-center justify-center"
                      onClick={() => removePreference(item, setPrefBrands)}
                      aria-label={`Remove ${item}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {prefTypes.map((item) => (
                  <span key={`type-${buildPreferenceSlug(item)}`} className="relative px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium">
                    {item}
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-600 text-white text-xs leading-none flex items-center justify-center"
                      onClick={() => removePreference(item, setPrefTypes)}
                      aria-label={`Remove ${item}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Categories</p>
                <div className="flex flex-wrap gap-2">
                  {preferenceOptions.categories.map((item) => {
                    const active = prefCategories.some((value) => buildPreferenceSlug(value) === buildPreferenceSlug(item));
                    return (
                      <button
                        key={`opt-cat-${buildPreferenceSlug(item)}`}
                        type="button"
                        onClick={() => togglePreference(item, prefCategories, setPrefCategories)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                          active ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-200 text-gray-700 hover:border-emerald-400"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Brands</p>
                <div className="flex flex-wrap gap-2">
                  {preferenceOptions.brands.map((item) => {
                    const active = prefBrands.some((value) => buildPreferenceSlug(value) === buildPreferenceSlug(item));
                    return (
                      <button
                        key={`opt-brand-${buildPreferenceSlug(item)}`}
                        type="button"
                        onClick={() => togglePreference(item, prefBrands, setPrefBrands)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                          active ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-200 text-gray-700 hover:border-emerald-400"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Product types</p>
                <div className="flex flex-wrap gap-2">
                  {preferenceOptions.productTypes.map((item) => {
                    const active = prefTypes.some((value) => buildPreferenceSlug(value) === buildPreferenceSlug(item));
                    return (
                      <button
                        key={`opt-type-${buildPreferenceSlug(item)}`}
                        type="button"
                        onClick={() => togglePreference(item, prefTypes, setPrefTypes)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                          active ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-200 text-gray-700 hover:border-emerald-400"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <Button
              size="sm"
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700 text-base"
              onClick={handleSavePreferences}
              disabled={savingPreferences}
            >
              {savingPreferences ? "Saving..." : "Save preferences"}
            </Button>
          </div>
        </div>
      </div>

      <div className={`${sectionClass} grid gap-4 md:grid-cols-2`}>
        <div className="rounded-md border border-gray-200 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-gray-900">Shipping address</p>
            <button
              type="button"
              className="text-base text-blue-600 hover:underline"
              onClick={() => setEditingShipping((prev) => !prev)}
            >
              {editingShipping ? "Cancel" : "Edit"}
            </button>
          </div>
          {!editingShipping ? (
            <div className="mt-2 text-base text-gray-600 space-y-1">
              <p>{`${shipping.firstName} ${shipping.lastName}`.trim() || "Add name"}</p>
              <p>{formatAddressLine(shipping)}</p>
              {shipping.phone && <p>{shipping.phone}</p>}
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="First name"
                  value={shipping.firstName}
                  onChange={(e) => setShipping((prev) => ({ ...prev, firstName: e.target.value }))}
                />
                <Input
                  placeholder="Last name"
                  value={shipping.lastName}
                  onChange={(e) => setShipping((prev) => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Phone"
                value={shipping.phone}
                onChange={(e) => setShipping((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <Input
                placeholder="Address line 1"
                value={shipping.address1}
                onChange={(e) => setShipping((prev) => ({ ...prev, address1: e.target.value }))}
              />
              <Input
                placeholder="Address line 2 (optional)"
                value={shipping.address2}
                onChange={(e) => setShipping((prev) => ({ ...prev, address2: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={shipping.city}
                  onChange={(e) => setShipping((prev) => ({ ...prev, city: e.target.value }))}
                />
                <Input
                  placeholder="State"
                  value={shipping.state}
                  onChange={(e) => setShipping((prev) => ({ ...prev, state: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Postal code"
                  value={shipping.postalCode}
                  onChange={(e) => setShipping((prev) => ({ ...prev, postalCode: e.target.value }))}
                />
                <Input
                  placeholder="Country"
                  value={shipping.countryCode}
                  onChange={(e) => setShipping((prev) => ({ ...prev, countryCode: e.target.value }))}
                />
              </div>
              <Button
                size="sm"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700 text-base"
                onClick={() => saveAddress("shipping")}
                disabled={savingShipping}
              >
                {savingShipping ? "Saving..." : "Save shipping"}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-md border border-gray-200 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-gray-900">Billing address</p>
            <button
              type="button"
              className="text-base text-blue-600 hover:underline"
              onClick={() => setEditingBilling((prev) => !prev)}
            >
              {editingBilling ? "Cancel" : "Edit"}
            </button>
          </div>
          {!editingBilling ? (
            <div className="mt-2 text-base text-gray-600 space-y-1">
              <p>{`${billing.firstName} ${billing.lastName}`.trim() || "Add name"}</p>
              <p>{formatAddressLine(billing)}</p>
              {billing.phone && <p>{billing.phone}</p>}
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="First name"
                  value={billing.firstName}
                  onChange={(e) => setBilling((prev) => ({ ...prev, firstName: e.target.value }))}
                />
                <Input
                  placeholder="Last name"
                  value={billing.lastName}
                  onChange={(e) => setBilling((prev) => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Phone"
                value={billing.phone}
                onChange={(e) => setBilling((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <Input
                placeholder="Address line 1"
                value={billing.address1}
                onChange={(e) => setBilling((prev) => ({ ...prev, address1: e.target.value }))}
              />
              <Input
                placeholder="Address line 2 (optional)"
                value={billing.address2}
                onChange={(e) => setBilling((prev) => ({ ...prev, address2: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={billing.city}
                  onChange={(e) => setBilling((prev) => ({ ...prev, city: e.target.value }))}
                />
                <Input
                  placeholder="State"
                  value={billing.state}
                  onChange={(e) => setBilling((prev) => ({ ...prev, state: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Postal code"
                  value={billing.postalCode}
                  onChange={(e) => setBilling((prev) => ({ ...prev, postalCode: e.target.value }))}
                />
                <Input
                  placeholder="Country"
                  value={billing.countryCode}
                  onChange={(e) => setBilling((prev) => ({ ...prev, countryCode: e.target.value }))}
                />
              </div>
              <Button
                size="sm"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700 text-base"
                onClick={() => saveAddress("billing")}
                disabled={savingBilling}
              >
                {savingBilling ? "Saving..." : "Save billing"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className={`${sectionClass} grid gap-4 md:grid-cols-2`}>
        <div className="rounded-md border border-gray-200 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-gray-900">Recent orders</p>
            <Link href="/orders" className="text-base text-blue-600 hover:underline">
              Show all
            </Link>
          </div>
          <div className="mt-2 space-y-2">
            {ordersLoading && <p className="text-base text-gray-500">Loading orders...</p>}
            {ordersError && <p className="text-base text-rose-600">{ordersError}</p>}
            {!ordersLoading && !ordersError && orders.length === 0 && (
              <p className="text-base text-gray-500">No recent orders.</p>
            )}
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${encodeURIComponent(order.id)}`}
                className="block border border-gray-200 rounded-md px-3 py-2 transition hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      Order #{order.display_id || order.id.slice(-6)}
                    </p>
                    <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold text-gray-900">
                      {formatCurrency(order.total, order.currency_code)}
                    </p>
                    <p className="text-sm text-emerald-700">{statusLabel(order.payment_status, order.fulfillment_status)}</p>
                  </div>
                </div>
                {order.items?.[0]?.title && (
                  <p className="text-sm text-gray-600 mt-1 line-clamp-1">
                    {order.items[0].title}
                    {order.items.length > 1 ? ` +${order.items.length - 1} more` : ""}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-gray-200 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-gray-900">Coins</p>
            <Link href="/my-reward" className="text-base text-blue-600 hover:underline">
              View wallet
            </Link>
          </div>
          {walletLoading ? (
            <p className="text-base text-gray-500 mt-2">Loading coins...</p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="border border-gray-200 rounded-md py-2">
                <p className="text-sm text-gray-500">Balance</p>
                <p className="text-base font-semibold text-amber-600">
                  {(wallet?.display_balance ?? wallet?.balance ?? 0).toFixed(0)}
                </p>
              </div>
              <div className="border border-gray-200 rounded-md py-2">
                <p className="text-sm text-gray-500">Earned</p>
                <p className="text-base font-semibold text-gray-900">{earnedCoins.toFixed(0)}</p>
              </div>
              <div className="border border-gray-200 rounded-md py-2">
                <p className="text-sm text-gray-500">Spent</p>
                <p className="text-base font-semibold text-gray-900">{spentCoins.toFixed(0)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

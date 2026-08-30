"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthProvider";

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

const toDigits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

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

export default function CustomerHub({ onLogout, layout = "dropdown" }: CustomerHubProps) {
  const { customer, refresh } = useAuth();
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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [_passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer?.id) return;
    const loadOrders = async () => {
      setOrdersLoading(true);
      try {
        const fetchOrders = () =>
          fetch("/api/medusa/orders?limit=20&offset=0", {
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
        const list = (data.orders || []) as Order[];
        const sorted = list
          .slice()
          .sort((a, b) => {
            const aTime = new Date((a as { created_at?: string }).created_at || 0).getTime();
            const bTime = new Date((b as { created_at?: string }).created_at || 0).getTime();
            return bTime - aTime;
          })
          .slice(0, 3);
        setOrders(sorted);
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
      address_name: isShipping ? "Home" : "Billing",
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
    setPasswordError(null);
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
      let message = error instanceof Error ? error.message : "Unable to update password.";
      const normalized = message.toLowerCase();
      if (normalized.includes("current password") || normalized.includes("invalid email or password")) {
        message = "Incorrect Current Password";
      }
      setPasswordError(message);
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
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
          <p className="text-base font-semibold text-gray-900">Update credentials</p>
          <div className="mt-2 space-y-2 max-h-[320px] overflow-y-auto pr-1">
            <div className="relative">
              <Input
                type={showCurrentPassword ? "text" : "password"}
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPasswordError(null);
                }}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="relative">
              <Input
                type={showNewPassword ? "text" : "password"}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(null);
                }}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                aria-label={showNewPassword ? "Hide new password" : "Show new password"}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordError(null);
                }}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button
              size="sm"
              className={`w-full text-base ${
                !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword
                  ? "bg-emerald-200 text-emerald-900 cursor-not-allowed hover:bg-emerald-200"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
              onClick={handlePasswordSave}
              disabled={
                savingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                newPassword !== confirmPassword
              }
            >
              {savingPassword ? "Saving..." : "Update password"}
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
                onChange={(e) => setShipping((prev) => ({ ...prev, phone: toDigits(e.target.value, 10) }))}
                inputMode="numeric"
                pattern="\\d{10}"
                maxLength={10}
                title="Enter a 10-digit phone number"
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
                  onChange={(e) => setShipping((prev) => ({ ...prev, postalCode: toDigits(e.target.value, 6) }))}
                  inputMode="numeric"
                  pattern="^[0-9]{6}$"
                  maxLength={6}
                  title="Enter a 6-digit PIN code"
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
                onChange={(e) => setBilling((prev) => ({ ...prev, phone: toDigits(e.target.value, 10) }))}
                inputMode="numeric"
                pattern="\\d{10}"
                maxLength={10}
                title="Enter a 10-digit phone number"
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
                  onChange={(e) => setBilling((prev) => ({ ...prev, postalCode: toDigits(e.target.value, 6) }))}
                  inputMode="numeric"
                  pattern="^[0-9]{6}$"
                  maxLength={6}
                  title="Enter a 6-digit PIN code"
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

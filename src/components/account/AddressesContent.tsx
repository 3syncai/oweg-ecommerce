"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import AccountLoginPrompt from "@/components/account/AccountLoginPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type CustomerAddress,
  type CustomerAddressInput,
  useAccountAddresses,
} from "@/hooks/useAccountAddresses";
import { useAuth } from "@/contexts/AuthProvider";

type AddressesContentProps = {
  embedded?: boolean;
};

type AddressFormState = {
  first_name: string;
  last_name: string;
  phone: string;
  address_1: string;
  address_2: string;
  city: string;
  province: string;
  postal_code: string;
  country_code: string;
  is_default_shipping: boolean;
  is_default_billing: boolean;
};

const emptyForm = (): AddressFormState => ({
  first_name: "",
  last_name: "",
  phone: "",
  address_1: "",
  address_2: "",
  city: "",
  province: "",
  postal_code: "",
  country_code: "IN",
  is_default_shipping: false,
  is_default_billing: false,
});

const toDigits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

function formFromAddress(address: CustomerAddress): AddressFormState {
  return {
    first_name: address.first_name || "",
    last_name: address.last_name || "",
    phone: address.phone || "",
    address_1: address.address_1 || "",
    address_2: address.address_2 || "",
    city: address.city || "",
    province: address.province || "",
    postal_code: address.postal_code || "",
    country_code: address.country_code || "IN",
    is_default_shipping: Boolean(address.is_default_shipping),
    is_default_billing: Boolean(address.is_default_billing),
  };
}

function formToInput(form: AddressFormState): CustomerAddressInput {
  return {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    phone: form.phone.trim(),
    address_1: form.address_1.trim(),
    address_2: form.address_2.trim(),
    city: form.city.trim(),
    province: form.province.trim(),
    postal_code: form.postal_code.trim(),
    country_code: form.country_code.trim() || "IN",
    is_default_shipping: form.is_default_shipping,
    is_default_billing: form.is_default_billing,
  };
}

function formatAddressLine(address: CustomerAddress): string {
  const parts = [
    address.address_1,
    address.address_2,
    address.city,
    address.province,
    address.postal_code,
  ]
    .map((part) => (part || "").trim())
    .filter(Boolean);
  return parts.join(", ") || "No address details";
}

type AddressModalProps = {
  open: boolean;
  mode: "add" | "edit";
  form: AddressFormState;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<AddressFormState>) => void;
  onSubmit: () => void;
};

function AddressModal({
  open,
  mode,
  form,
  saving,
  onClose,
  onChange,
  onSubmit,
}: AddressModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, saving]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/50 px-0 sm:items-center sm:px-4"
      onClick={() => {
        if (!saving) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF8E7]">
            <AccountHubIcon name="add-address" size={22} className="h-[22px] w-[22px]" />
          </div>
          <div>
            <h2 id="address-modal-title" className="text-lg font-semibold text-[#1F2A33]">
              {mode === "add" ? "Add New Address" : "Edit Address"}
            </h2>
            <p className="text-sm text-gray-500">Save delivery and billing details.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="First name"
              value={form.first_name}
              onChange={(e) => onChange({ first_name: e.target.value })}
            />
            <Input
              placeholder="Last name"
              value={form.last_name}
              onChange={(e) => onChange({ last_name: e.target.value })}
            />
          </div>
          <Input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => onChange({ phone: toDigits(e.target.value, 10) })}
            inputMode="numeric"
            maxLength={10}
          />
          <Input
            placeholder="Address line 1"
            value={form.address_1}
            onChange={(e) => onChange({ address_1: e.target.value })}
          />
          <Input
            placeholder="Address line 2 (optional)"
            value={form.address_2}
            onChange={(e) => onChange({ address_2: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="City"
              value={form.city}
              onChange={(e) => onChange({ city: e.target.value })}
            />
            <Input
              placeholder="State"
              value={form.province}
              onChange={(e) => onChange({ province: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="PIN code"
              value={form.postal_code}
              onChange={(e) => onChange({ postal_code: toDigits(e.target.value, 6) })}
              inputMode="numeric"
              maxLength={6}
            />
            <Input
              placeholder="Country code"
              value={form.country_code}
              onChange={(e) => onChange({ country_code: e.target.value.toUpperCase().slice(0, 2) })}
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm text-[#1F2A33]">
              <input
                type="checkbox"
                checked={form.is_default_shipping}
                onChange={(e) => onChange({ is_default_shipping: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-[#66C940] focus:ring-[#66C940]"
              />
              Default shipping
            </label>
            <label className="flex items-center gap-2 text-sm text-[#1F2A33]">
              <input
                type="checkbox"
                checked={form.is_default_billing}
                onChange={(e) => onChange({ is_default_billing: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-[#66C940] focus:ring-[#66C940]"
              />
              Default billing
            </label>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 border-gray-200"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 bg-[#66C940] text-white hover:bg-[#5ab838]"
            onClick={onSubmit}
            disabled={saving || !form.address_1.trim() || !form.city.trim()}
          >
            {saving ? "Saving..." : mode === "add" ? "Add Address" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AddressSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, idx) => (
        <div
          key={`address-skeleton-${idx}`}
          className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="h-4 w-32 rounded bg-gray-100" />
          <div className="mt-3 h-3 w-full rounded bg-gray-100" />
          <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
          <div className="mt-4 flex gap-2">
            <div className="h-8 w-20 rounded-full bg-gray-100" />
            <div className="h-8 w-20 rounded-full bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AddressesContent({ embedded = false }: AddressesContentProps) {
  const { customer } = useAuth();
  const {
    addresses,
    loading,
    saving,
    deleting,
    saveAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
  } = useAccountAddresses();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressFormState>(emptyForm());
  const [actionId, setActionId] = useState<string | null>(null);

  const sortedAddresses = useMemo(() => {
    return [...addresses].sort((a, b) => {
      const aScore =
        (a.is_default_shipping ? 2 : 0) + (a.is_default_billing ? 1 : 0);
      const bScore =
        (b.is_default_shipping ? 2 : 0) + (b.is_default_billing ? 1 : 0);
      return bScore - aScore;
    });
  }, [addresses]);

  const openAddModal = () => {
    setModalMode("add");
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEditModal = (address: CustomerAddress) => {
    setModalMode("edit");
    setEditingId(address.id);
    setForm(formFromAddress(address));
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleFormChange = (patch: Partial<AddressFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = async () => {
    const input = formToInput(form);
    if (!input.address_1?.trim() || !input.city?.trim()) {
      toast.error("Address line and city are required.");
      return;
    }

    try {
      if (modalMode === "edit" && editingId) {
        await updateAddress(editingId, input);
        toast.success("Address updated.");
      } else {
        await saveAddress(input);
        toast.success("Address added.");
      }
      closeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save address.";
      toast.error(message);
    }
  };

  const handleDelete = async (id: string) => {
    setActionId(id);
    try {
      await deleteAddress(id);
      toast.success("Address removed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete address.";
      toast.error(message);
    } finally {
      setActionId(null);
    }
  };

  const handleSetDefault = async (
    id: string,
    type: "shipping" | "billing" | "both"
  ) => {
    setActionId(id);
    try {
      await setDefaultAddress(id, type);
      toast.success(
        type === "shipping"
          ? "Default shipping address updated."
          : type === "billing"
            ? "Default billing address updated."
            : "Default address updated."
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to set default address.";
      toast.error(message);
    } finally {
      setActionId(null);
    }
  };

  if (!customer) {
    return (
      <AccountLoginPrompt
        redirect="/account/addresses"
        title="Sign in to manage addresses"
        description="Please log in to add, edit, or remove your delivery addresses."
      />
    );
  }

  const wrapperClass = embedded ? "space-y-5" : "mx-auto max-w-5xl space-y-6 px-4 py-10";

  return (
    <div className={wrapperClass}>
      {!embedded ? (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF8E7]">
            <AccountHubIcon name="addresses" size={22} className="h-[22px] w-[22px]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#1F2A33]">Your Addresses</h1>
            <p className="text-sm text-gray-600">Manage shipping and billing locations.</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          {loading ? "Loading addresses…" : `${addresses.length} saved address${addresses.length === 1 ? "" : "es"}`}
        </p>
        <Button
          type="button"
          className="bg-[#66C940] text-white hover:bg-[#5ab838] rounded-full"
          onClick={openAddModal}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add New Address
        </Button>
      </div>

      {loading && addresses.length === 0 ? <AddressSkeleton /> : null}

      {!loading && addresses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF8E7]">
            <MapPin className="h-7 w-7 text-[#66C940]" />
          </div>
          <p className="mt-4 text-lg font-semibold text-[#1F2A33]">No addresses yet</p>
          <p className="mt-1 text-sm text-gray-500">Add an address for faster checkout.</p>
          <Button
            type="button"
            className="mt-5 bg-[#66C940] text-white hover:bg-[#5ab838] rounded-full"
            onClick={openAddModal}
          >
            Add your first address
          </Button>
        </div>
      ) : null}

      {addresses.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {sortedAddresses.map((address) => {
            const isBusy = actionId === address.id && (saving || deleting);
            const name = `${address.first_name || ""} ${address.last_name || ""}`.trim() || "Address";

            return (
              <div
                key={address.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#66C940]/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1F2A33]">{name}</p>
                    {address.phone ? (
                      <p className="mt-1 text-sm text-gray-500">{address.phone}</p>
                    ) : null}
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF8E7]">
                    <AccountHubIcon name="default-address" size={20} className="h-5 w-5" />
                  </div>
                </div>

                <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                  {formatAddressLine(address)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {address.is_default_shipping ? (
                    <span className="rounded-full bg-[#EAF8E7] px-3 py-1 text-xs font-semibold text-[#66C940]">
                      Default Shipping
                    </span>
                  ) : null}
                  {address.is_default_billing ? (
                    <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                      Default Billing
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-[#1F2A33] hover:border-[#66C940] hover:text-[#66C940]"
                    onClick={() => openEditModal(address)}
                    disabled={isBusy}
                  >
                    Edit
                  </button>
                  {!address.is_default_shipping ? (
                    <button
                      type="button"
                      className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-[#1F2A33] hover:border-[#66C940] hover:text-[#66C940]"
                      onClick={() => handleSetDefault(address.id, "shipping")}
                      disabled={isBusy}
                    >
                      Set shipping default
                    </button>
                  ) : null}
                  {!address.is_default_billing ? (
                    <button
                      type="button"
                      className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-[#1F2A33] hover:border-[#66C940] hover:text-[#66C940]"
                      onClick={() => handleSetDefault(address.id, "billing")}
                      disabled={isBusy}
                    >
                      Set billing default
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(address.id)}
                    disabled={isBusy}
                  >
                    {deleting && actionId === address.id ? (
                      <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="inline h-3.5 w-3.5" />
                    )}
                    <span className="ml-1">Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <AddressModal
        open={modalOpen}
        mode={modalMode}
        form={form}
        saving={saving}
        onClose={closeModal}
        onChange={handleFormChange}
        onSubmit={() => {
          void handleSubmit();
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { Check, MapPin, X } from "lucide-react";
import { hasDeliveryPincode, useDeliveryLocation } from "@/contexts/DeliveryLocationProvider";
import { deriveCustomerAddressName } from "@/lib/customer-address-name";

export default function SavedDeliveryAddresses({ onEnterPincode }: { onEnterPincode: () => void }) {
  const { addresses, addressList, selectedAddress, chooseAddress, closePicker } = useDeliveryLocation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  const sorted = [...addresses].sort((a, b) => Number(Boolean(b.is_default_shipping)) - Number(Boolean(a.is_default_shipping)));

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); closePicker(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-auto overscroll-contain rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-slate-900 shadow-xl backdrop:bg-black/45 sm:inset-0 sm:m-auto sm:max-w-md sm:rounded-2xl sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-xl font-bold">Choose a delivery address</h2>
          <p className="mt-1 text-sm text-slate-600">See delivery information for the area you choose.</p>
        </div>
        <button type="button" onClick={closePicker} aria-label="Close delivery addresses" className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-green-700">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="my-4 space-y-2">
        {addressList.isPending && <p role="status" className="text-sm text-slate-600">Loading saved addresses…</p>}
        {addressList.isError && (
          <div role="status" className="text-sm text-slate-700">
            Could not refresh saved addresses. <button type="button" className="min-h-11 font-semibold underline" onClick={() => void addressList.refetch()}>Retry</button>
          </div>
        )}
        {addressList.isSuccess && !sorted.length && <p className="text-sm text-slate-600">You have no saved addresses yet.</p>}
        {sorted.map(address => {
          const valid = hasDeliveryPincode(address);
          const selected = selectedAddress?.id === address.id;
          return (
            <button
              key={address.id} type="button" disabled={!valid} aria-pressed={selected}
              onClick={() => chooseAddress(address.id)}
              className="flex min-h-14 w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left enabled:hover:border-green-700 enabled:hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-green-700 disabled:bg-slate-50"
            >
              <MapPin size={18} className="mt-1 shrink-0 text-green-800" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words">
                <span className="block font-semibold">{deriveCustomerAddressName(address)}{address.is_default_shipping && <span className="ml-2 text-xs font-medium text-green-800">Default</span>}</span>
                <span className="block text-sm text-slate-600">{[address.address_1, address.address_2, address.city, address.province, address.postal_code].filter(Boolean).join(", ")}</span>
                {!valid && <span className="block text-xs text-slate-600">Update the address to use a valid Indian pincode.</span>}
              </span>
              {selected && <Check size={18} aria-hidden="true" className="shrink-0 text-green-800" />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 border-t border-slate-200 pt-2 text-sm font-semibold text-green-900">
        <button type="button" className="min-h-11 underline" onClick={onEnterPincode}>Enter a pincode instead</button>
        <Link href="/account/addresses" className="inline-flex min-h-11 items-center underline" onClick={closePicker}>Manage addresses</Link>
      </div>
    </dialog>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { useAccountAddressList, type CustomerAddress } from "@/hooks/useAccountAddresses";

const PIN_KEY = "oweg_pincode";
const PLACE_KEY = "oweg_pincode_place";
const ADDRESS_KEY = "oweg_delivery_address";
const NO_ADDRESSES: CustomerAddress[] = [];

export function hasDeliveryPincode(address: CustomerAddress) {
  return (!address.country_code || address.country_code.toLowerCase() === "in") &&
    /^[1-9]\d{5}$/.test(address.postal_code?.trim() ?? "");
}

type Selection = { customerId: string; addressId: string };
type Area = { pincode: string; place: string };
type DeliveryLocation = Area & {
  selectedAddress: CustomerAddress | undefined;
  addressList: ReturnType<typeof useAccountAddressList>;
  addresses: CustomerAddress[];
  pickerOpen: boolean;
  addressReviewPending: boolean;
  openPicker: () => void;
  closePicker: () => void;
  chooseAddress: (id: string) => void;
  choosePincode: (pincode: string, place: string) => void;
  fillPlace: (pincode: string, place: string) => void;
};

const DeliveryLocationContext = createContext<DeliveryLocation | null>(null);

export default function DeliveryLocationProvider({ children }: { children: React.ReactNode }) {
  const { customer, signIn } = useAuth();
  const customerId = customer?.id;
  const addressList = useAccountAddressList(customerId);
  const addresses = addressList.data ?? NO_ADDRESSES;
  const [area, setArea] = useState<Area>({ pincode: "", place: "" });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pickerOwner, setPickerOwner] = useState<string>();
  const previousCustomer = useRef<string | undefined>(undefined);
  const [handledSignIn, setHandledSignIn] = useState<typeof signIn>(null);
  const newSignIn = Boolean(signIn && signIn.customerId === customerId && handledSignIn !== signIn);
  const pickerOpen = Boolean(customerId && pickerOwner === customerId);

  useEffect(() => {
    const readArea = () => {
      try {
        setArea({ pincode: localStorage.getItem(PIN_KEY) || "", place: localStorage.getItem(PLACE_KEY) || "" });
      } catch { /* Storage is optional. */ }
    };
    readArea();
    const onStorage = (event: StorageEvent) => {
      if (event.key === PIN_KEY || event.key === PLACE_KEY || event.key === null) readArea();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const previous = previousCustomer.current;
    previousCustomer.current = customerId;
    try {
      if (previous && previous !== customerId) {
        setPickerOwner(undefined);
        sessionStorage.removeItem(ADDRESS_KEY);
      }
      if (customerId) {
        const saved = JSON.parse(sessionStorage.getItem(ADDRESS_KEY) || "null") as Selection | null;
        if (saved?.customerId === customerId && typeof saved.addressId === "string") {
          setSelection(saved);
          return;
        }
      }
    } catch { /* Storage is optional. */ }
    setSelection(null);
  }, [customerId]);

  const closePicker = useCallback(() => setPickerOwner(undefined), []);
  const openPicker = useCallback(() => {
    if (customerId) setPickerOwner(customerId);
  }, [customerId]);

  const chooseAddress = useCallback((id: string) => {
    if (!customerId || !addresses.some(address => address.id === id && hasDeliveryPincode(address))) return;
    const next = { customerId, addressId: id };
    setSelection(next);
    closePicker();
    try { sessionStorage.setItem(ADDRESS_KEY, JSON.stringify(next)); } catch { /* Storage is optional. */ }
  }, [addresses, closePicker, customerId]);

  useEffect(() => {
    if (!newSignIn || !addressList.isSuccess || addressList.isFetching) return;
    setHandledSignIn(signIn);
    if (addresses.length === 1 && hasDeliveryPincode(addresses[0])) chooseAddress(addresses[0].id);
    else if (addresses.length >= 2) openPicker();
  }, [addressList.isFetching, addressList.isSuccess, addresses, chooseAddress, newSignIn, openPicker, signIn]);

  const choosePincode = useCallback((pincode: string, place: string) => {
    setHandledSignIn(signIn);
    setSelection(null);
    setArea({ pincode, place });
    closePicker();
    try {
      sessionStorage.removeItem(ADDRESS_KEY);
      localStorage.setItem(PIN_KEY, pincode);
      if (place) localStorage.setItem(PLACE_KEY, place);
      else localStorage.removeItem(PLACE_KEY);
    } catch { /* Storage is optional. */ }
  }, [closePicker, signIn]);

  const fillPlace = useCallback((pincode: string, place: string) => {
    setArea(current => current.pincode === pincode && !current.place ? { pincode, place } : current);
  }, []);

  const selectedAddress = selection?.customerId === customerId
    ? addresses.find(address => address.id === selection?.addressId && hasDeliveryPincode(address))
    : undefined;
  const location = selectedAddress ? {
    pincode: selectedAddress.postal_code!.trim(),
    place: [...new Set([selectedAddress.city, selectedAddress.province].map(value => value?.trim()).filter(Boolean))].join(", "),
  } : area;

  return <DeliveryLocationContext.Provider value={{
    ...location, addressList, addresses, selectedAddress, pickerOpen,
    addressReviewPending: pickerOpen || (newSignIn && (!addressList.isError || addressList.isFetching)),
    openPicker, closePicker, chooseAddress, choosePincode, fillPlace,
  }}>{children}</DeliveryLocationContext.Provider>;
}

export function useDeliveryLocation() {
  const value = useContext(DeliveryLocationContext);
  if (!value) throw new Error("useDeliveryLocation must be used inside DeliveryLocationProvider");
  return value;
}

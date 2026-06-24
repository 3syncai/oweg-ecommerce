"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  type CustomPaymentMethod,
  type CustomPaymentPayload,
  isMobileDevice,
} from "@/lib/razorpay-custom-client";
import {
  getCachedRazorpayMethods,
  prefetchRazorpayMethods,
  type RazorpayMethodsPayload,
} from "@/lib/razorpay-warmup";

export type PaymentPrefill = {
  name?: string;
  email?: string;
  contact?: string;
};

export type OwegPaymentFormHandle = {
  getPaymentPayload: () => CustomPaymentPayload | null;
  getValidationError: () => string | null;
};

type OwegPaymentFormProps = {
  enabled: boolean;
  prefill: PaymentPrefill;
};

const UPI_APPS = [
  {
    id: "gpay",
    label: "Google Pay",
    package: "com.google.android.apps.nbu.paisa.user",
    color: "#4285F4",
  },
  {
    id: "phonepe",
    label: "PhonePe",
    package: "com.phonepe.app",
    color: "#5f259f",
  },
  {
    id: "paytm",
    label: "Paytm",
    package: "net.one97.paytm",
    color: "#00BAF2",
  },
  {
    id: "bhim",
    label: "BHIM",
    package: "in.org.npci.upiapp",
    color: "#008C44",
  },
];

const WALLET_LABELS: Record<string, string> = {
  paytm: "Paytm",
  mobikwik: "Mobikwik",
  airtel: "Airtel Money",
  freecharge: "Freecharge",
  jiomoney: "Jio Money",
  olamoney: "Ola Money",
  amazonpay: "Amazon Pay",
};

const FALLBACK_BANKS: Array<{ code: string; name: string }> = [
  { code: "HDFC", name: "HDFC Bank" },
  { code: "ICIC", name: "ICICI Bank" },
  { code: "SBIN", name: "State Bank of India" },
  { code: "UTIB", name: "Axis Bank" },
  { code: "KKBK", name: "Kotak Mahindra Bank" },
  { code: "YESB", name: "Yes Bank" },
  { code: "PUNB", name: "Punjab National Bank" },
  { code: "BARB", name: "Bank of Baroda" },
];

function formatCardNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export const OwegPaymentForm = forwardRef<OwegPaymentFormHandle, OwegPaymentFormProps>(
  function OwegPaymentForm({ enabled, prefill }, ref) {
    const [method, setMethod] = useState<CustomPaymentMethod>("upi");
    const [selectedUpiApp, setSelectedUpiApp] = useState(UPI_APPS[0].package);
    const [selectedBank, setSelectedBank] = useState("HDFC");
    const [selectedWallet, setSelectedWallet] = useState("paytm");
    const [banks, setBanks] = useState(FALLBACK_BANKS);
    const [wallets, setWallets] = useState<Array<{ code: string; name: string }>>([
      { code: "paytm", name: "Paytm" },
      { code: "mobikwik", name: "Mobikwik" },
    ]);
    const [methodsLoading, setMethodsLoading] = useState(false);

    const [cardName, setCardName] = useState(prefill.name || "");
    const [cardNumber, setCardNumber] = useState("");
    const [cardExpiry, setCardExpiry] = useState("");
    const [cardCvv, setCardCvv] = useState("");

    const isMobile = useMemo(() => isMobileDevice(), []);

    const applyMethodsPayload = useCallback((data: RazorpayMethodsPayload | null) => {
      if (!data) return;
      const netbanking = data.netbanking;
      if (netbanking && typeof netbanking === "object") {
        const list = Object.entries(netbanking).map(([code, name]) => ({ code, name }));
        if (list.length) {
          setBanks(list);
          setSelectedBank(list[0].code);
        }
      }
      const walletMap = data.wallet;
      if (walletMap && typeof walletMap === "object") {
        const list = Object.entries(walletMap).map(([code, name]) => ({
          code,
          name: WALLET_LABELS[code] || name,
        }));
        if (list.length) {
          setWallets(list);
          setSelectedWallet(list[0].code);
        }
      }
    }, []);

    useEffect(() => {
      if (!enabled) return;

      const cached = getCachedRazorpayMethods();
      if (cached) {
        applyMethodsPayload(cached);
        return;
      }

      setMethodsLoading(true);
      void prefetchRazorpayMethods()
        .then(applyMethodsPayload)
        .catch(() => undefined)
        .finally(() => setMethodsLoading(false));
    }, [enabled, applyMethodsPayload]);

    useEffect(() => {
      if (prefill.name && !cardName) setCardName(prefill.name);
    }, [prefill.name, cardName]);

    const getValidationError = useCallback((): string | null => {
      if (!enabled) return null;
      if (method === "card") {
        if (!cardName.trim()) return "Enter cardholder name";
        if (cardNumber.replace(/\s/g, "").length < 15) return "Enter a valid card number";
        if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) return "Enter expiry as MM/YY";
        if (cardCvv.length < 3) return "Enter card CVV";
      }
      if (method === "netbanking" && !selectedBank) return "Select your bank";
      if (method === "wallet" && !selectedWallet) return "Select a wallet";
      return null;
    }, [enabled, method, cardName, cardNumber, cardExpiry, cardCvv, selectedBank, selectedWallet]);

    const getPaymentPayload = useCallback((): CustomPaymentPayload | null => {
      if (getValidationError()) return null;

      if (method === "upi") {
        return {
          method: "upi",
          upiAppPackage: isMobile ? selectedUpiApp : undefined,
          upiFlow: isMobile ? "intent" : "qr",
        };
      }

      if (method === "card") {
        return {
          method: "card",
          card: {
            name: cardName.trim(),
            number: cardNumber,
            expiry: cardExpiry,
            cvv: cardCvv,
          },
        };
      }

      if (method === "netbanking") {
        return { method: "netbanking", bank: selectedBank };
      }

      return { method: "wallet", wallet: selectedWallet };
    }, [
      getValidationError,
      method,
      isMobile,
      selectedUpiApp,
      cardName,
      cardNumber,
      cardExpiry,
      cardCvv,
      selectedBank,
      selectedWallet,
    ]);

    useImperativeHandle(ref, () => ({ getPaymentPayload, getValidationError }), [
      getPaymentPayload,
      getValidationError,
    ]);

    if (!enabled) {
      return (
        <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
          Cash on delivery — pay when your order arrives. No online payment needed.
        </div>
      );
    }

    const tabs: Array<{ id: CustomPaymentMethod; label: string }> = [
      { id: "upi", label: "UPI" },
      { id: "card", label: "Card" },
      { id: "netbanking", label: "Net Banking" },
      { id: "wallet", label: "Wallet" },
    ];

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMethod(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                method === tab.id
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-green-500"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {methodsLoading && (
          <p className="text-xs text-slate-500">Loading banks and wallets from Razorpay…</p>
        )}

        {method === "upi" && (
          <div className="space-y-3">
            {isMobile ? (
              <>
                <p className="text-sm text-slate-600">Open your UPI app to approve the payment.</p>
                <div className="grid grid-cols-2 gap-2">
                  {UPI_APPS.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => setSelectedUpiApp(app.package)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        selectedUpiApp === app.package
                          ? "border-green-600 ring-1 ring-green-600 bg-green-50"
                          : "border-slate-200 hover:border-green-400"
                      }`}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full mr-2"
                        style={{ backgroundColor: app.color }}
                      />
                      <span className="text-sm font-medium text-slate-900">{app.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="text-sm font-medium text-slate-900">Scan QR with any UPI app</p>
                <p className="text-xs text-slate-600">
                  After you click Pay, a QR code will open. Scan it with PhonePe, Google Pay, or any
                  UPI app on your phone.
                </p>
              </div>
            )}
          </div>
        )}

        {method === "card" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Name on card</label>
              <Input
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                placeholder="Cardholder name"
                autoComplete="cc-name"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Card number</label>
              <Input
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="1234 5678 9012 3456"
                inputMode="numeric"
                autoComplete="cc-number"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Expiry</label>
              <Input
                value={cardExpiry}
                onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                placeholder="MM/YY"
                inputMode="numeric"
                autoComplete="cc-exp"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">CVV</label>
              <Input
                value={cardCvv}
                onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="123"
                inputMode="numeric"
                autoComplete="cc-csc"
                type="password"
              />
            </div>
            <p className="sm:col-span-2 text-[11px] text-slate-500">
              Card details are sent directly to Razorpay. OWEG never stores your card number.
            </p>
          </div>
        )}

        {method === "netbanking" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 block">Select bank</label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
            >
              {banks.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">You&apos;ll be redirected to your bank&apos;s secure page.</p>
          </div>
        )}

        {method === "wallet" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 block">Select wallet</label>
            <div className="grid grid-cols-2 gap-2">
              {wallets.map((wallet) => (
                <button
                  key={wallet.code}
                  type="button"
                  onClick={() => setSelectedWallet(wallet.code)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    selectedWallet === wallet.code
                      ? "border-green-600 bg-green-50 text-green-800"
                      : "border-slate-200 hover:border-green-400 text-slate-800"
                  }`}
                >
                  {wallet.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

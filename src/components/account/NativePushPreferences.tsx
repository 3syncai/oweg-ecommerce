"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { enableNativePush, nativePushSupported } from "@/lib/native-push";

export default function NativePushPreferences() {
  const { customer } = useAuth();
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSupported(nativePushSupported());
  }, []);

  useEffect(() => {
    if (!supported || !customer?.id) return;
    let mounted = true;
    const read = async () => {
      try {
        const response = await fetch("/api/medusa/push-subscriptions?provider=fcm", {
          cache: "no-store",
          credentials: "include",
          signal: AbortSignal.timeout(8000),
        });
        const data = await response.json();
        if (!mounted) return;
        if (!response.ok) throw new Error("Unable to read settings");
        setActive(Boolean(data.active));
        if (!data.native_configured && !data.configured) {
          setMessage("App notifications are being set up. Please try again later.");
        }
      } catch {
        if (mounted) setMessage("Unable to read this device’s notification settings.");
      }
    };
    void read();
    const onUpdated = () => void read();
    window.addEventListener("oweg:push-updated", onUpdated);
    return () => {
      mounted = false;
      window.removeEventListener("oweg:push-updated", onUpdated);
    };
  }, [supported, customer?.id]);

  async function enable() {
    if (busy || active || !customer?.id) return;
    setBusy(true);
    setMessage("");
    try {
      await enableNativePush({ customerId: customer.id });
      setActive(true);
      setMessage("You’re subscribed to OWEG offers and updates on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"
      aria-labelledby="native-push-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <h2 id="native-push-title" className="text-lg font-semibold">
            App notifications
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Get OWEG offers and updates on this phone even when the app is closed. You can turn
            them off in device settings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy || active}
          className="shrink-0 rounded-full bg-[#155344] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Please wait…" : active ? "Enabled on this device" : "Enable notifications"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-[#155344]">
        {message}
      </p>
    </section>
  );
}

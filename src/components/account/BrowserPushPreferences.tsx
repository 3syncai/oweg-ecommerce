"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { disableBrowserPush, enableBrowserPush } from "@/lib/browser-push";
import { isStandalonePwa } from "@/lib/open-storefront-link";

export default function BrowserPushPreferences() {
  const { customer } = useAuth();
  const customerId = customer?.id;
  const [installed, setInstalled] = useState(false);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const updating = useRef(false);
  const lifetime = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const standalone = isStandalonePwa();
    setInstalled(standalone);
    if (!standalone || !customerId || !("serviceWorker" in navigator) ||
        !("Notification" in window) || !("PushManager" in window)) {
      setBusy(false);
      return () => controller.abort();
    }

    async function read() {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        const query = subscription ? "?endpoint=" + encodeURIComponent(subscription.endpoint) : "";
        const response = await fetch("/api/medusa/push-subscriptions" + query, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (controller.signal.aborted || updating.current) return;
        setActive(Boolean(data.active) && Notification.permission === "granted");
        setReady(Boolean(data.configured));
        setMessage(data.configured ? "" : "App notifications are temporarily unavailable.");
      } catch {
        if (!controller.signal.aborted && !updating.current) setMessage("Couldn’t check this device’s notification settings. Reopen this page to retry.");
      } finally {
        if (!controller.signal.aborted && !updating.current) setBusy(false);
      }
    }

    void read();
    return () => controller.abort();
  }, [customerId]);

  async function change(enabled: boolean) {
    const signal = lifetime.current?.signal;
    if (!customerId || !signal || signal.aborted || updating.current || busy || !installed) return;
    updating.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (enabled) await enableBrowserPush({ customerId, signal });
      else await disableBrowserPush({ signOut: false });
      if (!signal.aborted) setActive(enabled);
    } catch (error) {
      if (!signal.aborted) setMessage(error instanceof Error ? error.message : "Couldn’t update notifications. Try again.");
    } finally {
      updating.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  return <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
    <h2 className="text-lg font-semibold">App notifications</h2>
    {!installed ? <p className="mt-2 text-sm text-gray-600">Open the installed OWEG app to manage device notifications. You can still read your updates in the notifications inbox.</p> :
      <fieldset disabled={busy || (!ready && !active)} className="mt-3 space-y-2 disabled:opacity-60">
        <legend className="text-sm text-gray-600">Choose whether to receive offers and product updates on this device.</legend>
        {([{ value: true, label: "Allow product updates" }, { value: false, label: "Don’t allow notifications" }]).map(({ value, label }) =>
          <label key={String(value)} className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 px-4 py-2 text-sm">
            <input type="radio" name="oweg-app-notifications" checked={ready && active === value}
              className="accent-[#155344]" onChange={() => void change(value)} />
            {label}
          </label>
        )}
      </fieldset>}
    {installed && <p role="status" className="mt-2 text-sm text-[#155344]">{busy ? "Please wait…" : message}</p>}
  </section>;
}

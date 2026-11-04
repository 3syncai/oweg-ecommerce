"use client";

import { useEffect, useState } from "react";
import { evaluateForceUpdate, openStoreListing } from "@/lib/force-update";
import { isNativeApp } from "@/lib/native-app";

export default function ForceUpdateGate() {
  const [blocking, setBlocking] = useState(false);
  const [message, setMessage] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    const controller = new AbortController();
    void evaluateForceUpdate(controller.signal).then((result) => {
      if (!result?.required || controller.signal.aborted) return;
      setMessage(result.message);
      setStoreUrl(result.storeUrl);
      setBlocking(true);
    });
    return () => controller.abort();
  }, []);

  if (!blocking) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="oweg-force-update-title"
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-[#fafbf7] px-6"
    >
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold tracking-wide text-[#7AC943]">OWEG</p>
        <h1 id="oweg-force-update-title" className="mt-3 text-2xl font-semibold text-[#1F2A33]">
          Update required
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{message}</p>
        <button
          type="button"
          disabled={busy || !storeUrl}
          className="mt-8 w-full rounded-full bg-[#155344] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => {
            if (!storeUrl) return;
            setBusy(true);
            void openStoreListing(storeUrl).finally(() => setBusy(false));
          }}
        >
          {busy ? "Opening store…" : "Update OWEG"}
        </button>
      </div>
    </div>
  );
}

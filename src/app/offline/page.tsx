"use client";

import { useCallback, useEffect, useState } from "react";

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);

  const retry = useCallback(() => {
    setRetrying(true);
    window.location.reload();
  }, []);

  useEffect(() => {
    const goOnline = () => {
      if (navigator.onLine) {
        retry();
      }
    };

    window.addEventListener("online", goOnline);
    return () => window.removeEventListener("online", goOnline);
  }, [retry]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#7AC943]/15 text-3xl">
        📡
      </div>
      <h1 className="mb-3 text-2xl font-bold text-slate-900">You&apos;re offline</h1>
      <p className="mb-8 text-sm leading-relaxed text-slate-600">
        OWEG needs an internet connection to load products, prices, and checkout.
        Check your connection, then try again.
      </p>
      <button
        type="button"
        onClick={retry}
        disabled={retrying}
        className="rounded-lg bg-[#7AC943] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#6bb838] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

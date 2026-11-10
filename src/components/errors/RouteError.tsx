"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CircleAlert, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

type RouteErrorProps = {
  title?: string;
  description?: string;
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RouteError({
  title = "Something went wrong",
  description = "We hit an unexpected error. Please try again.",
  error,
  reset,
}: RouteErrorProps) {
  const online = useOnlineStatus();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-900">
        {online ? <CircleAlert size={24} aria-hidden="true" /> : <WifiOff size={24} aria-hidden="true" />}
      </div>
      <h1 className="mb-3 text-2xl font-bold text-[#17372f]">{online ? title : "You’re offline"}</h1>
      <p className="mb-6 text-sm leading-relaxed text-slate-600">{online ? description : "Reconnect to the internet, then try loading this page again."}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          disabled={!online}
          className="min-h-11 rounded-xl bg-[#155344] px-6 py-3 text-sm font-semibold text-white hover:bg-[#103e34] disabled:opacity-60"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

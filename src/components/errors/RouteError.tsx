"use client";

import Link from "next/link";
import { useEffect } from "react";

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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-3xl">
        ⚠️
      </div>
      <h1 className="mb-3 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mb-8 text-sm leading-relaxed text-slate-600">{description}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[#7AC943] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#6bb838]"
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

"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white antialiased">
        <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-3xl">
            ⚠️
          </div>
          <h1 className="mb-3 text-2xl font-bold text-slate-900">OWEG hit a snag</h1>
          <p className="mb-8 text-sm leading-relaxed text-slate-600">
            A critical error stopped the app from loading. Please try again.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-[#7AC943] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#6bb838]"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Go home
            </a>
          </div>
          {process.env.NODE_ENV === "development" && error.message ? (
            <p className="mt-8 max-w-full break-words text-left text-xs text-slate-500">
              {error.message}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}

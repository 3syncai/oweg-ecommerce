"use client";

import RouteError from "@/components/errors/RouteError";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Something went wrong"
      description="We couldn't load this page. Please try again or return to the homepage."
    />
  );
}

"use client";

import RouteError from "@/components/errors/RouteError";

export default function ProductError({
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
      title="Product page unavailable"
      description="We couldn't load this product. Please try again or browse other items."
    />
  );
}

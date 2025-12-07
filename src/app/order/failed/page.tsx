"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

function OrderFailedPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get("orderId");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="bg-white shadow-md rounded-2xl p-6 md:p-8 max-w-lg w-full space-y-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Payment failed</h1>
            <p className="text-sm text-slate-600">
              Your payment was cancelled or failed. Any held inventory has been released.
            </p>
            {orderId && (
              <p className="text-xs text-slate-500 mt-2">
                Reference: <span className="font-semibold">{orderId}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => router.push("/checkout")}>Retry payment</Button>
          <Button variant="outline" onClick={() => router.push("/")}>
            Continue shopping
          </Button>
          <Button variant="ghost" onClick={() => router.push("/orders")}>
            View my orders
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function OrderFailedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-600">
          Loading order...
        </div>
      }
    >
      <OrderFailedPageInner />
    </Suspense>
  );
}

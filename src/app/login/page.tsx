"use client";

import React, { Suspense, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthProvider";
import { getSafeRedirect } from "@/lib/auth-redirect";
import CustomerLoginFlow from "@/components/auth/CustomerLoginFlow";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { customer, initializing } = useAuth();
  const redirectTarget = getSafeRedirect(searchParams.get("redirect"));

  useEffect(() => {
    if (initializing) return;
    if (customer) {
      router.replace(redirectTarget);
    }
  }, [customer, initializing, router, redirectTarget]);

  useEffect(() => {
    if (searchParams.get("reset") !== "success") return;
    toast.success("Password reset successfully. Please log in.");
    router.replace("/login");
  }, [router, searchParams]);

  return (
    <div
      className="min-h-[100svh] bg-gradient-to-br from-slate-50 to-green-50/30 text-slate-800"
      style={{
        fontFamily: 'OPTIHandelGothic-Light, "Inter", "Arial", sans-serif',
      }}
    >
      <main className="mx-auto max-w-7xl px-4 py-12 md:py-20">
        <div className="grid gap-8 md:grid-cols-2 items-stretch">
          <CustomerLoginFlow
            variant="page"
            className="order-2 md:order-1"
            signupRedirectPath={
              redirectTarget && redirectTarget !== "/" ? redirectTarget : undefined
            }
            onSuccess={() => {
              router.push(redirectTarget);
            }}
          />

          <aside className="order-1 md:order-2 relative overflow-hidden rounded-2xl border border-slate-200/60 shadow-xl bg-[#f3f9f1] min-h-[20rem] md:min-h-full">
            <Image
              src="/login.png"
              alt="Secure login, smarter shopping with OWEG"
              fill
              className="object-contain"
              priority
              unoptimized
            />
          </aside>
        </div>
      </main>

      <footer className="border-t border-slate-200/60 bg-white/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} OWEG. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

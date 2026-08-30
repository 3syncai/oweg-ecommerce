"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import AccountHubLayout from "@/components/account/AccountHubLayout";
import AccountLoginPrompt from "@/components/account/AccountLoginPrompt";
import { useAuth } from "@/contexts/AuthProvider";

export default function AccountHubRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { customer, initializing } = useAuth();
  const pathname = usePathname() || "/account";
  const router = useRouter();
  const isPreferencesRoute = pathname === "/account/preferences" || pathname.startsWith("/account/preferences/");

  useEffect(() => {
    if (isPreferencesRoute) {
      router.replace("/account");
    }
  }, [isPreferencesRoute, router]);

  if (isPreferencesRoute) return null;

  if (initializing) return null;

  if (!customer) {
    return <AccountLoginPrompt redirect={pathname} />;
  }

  return <AccountHubLayout>{children}</AccountHubLayout>;
}

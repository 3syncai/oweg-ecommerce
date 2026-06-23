"use client";



import type { ReactNode } from "react";

import { usePathname } from "next/navigation";

import AccountHubLayout from "@/components/account/AccountHubLayout";

import AccountLoginPrompt from "@/components/account/AccountLoginPrompt";

import { useAuth } from "@/contexts/AuthProvider";



export default function AccountHubRouteLayout({ children }: { children: ReactNode }) {

  const { customer, initializing } = useAuth();

  const pathname = usePathname() || "/account";



  if (initializing) return null;



  if (!customer) {

    return <AccountLoginPrompt redirect={pathname} />;

  }



  return <AccountHubLayout>{children}</AccountHubLayout>;

}


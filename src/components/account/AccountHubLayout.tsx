"use client";

import type { ReactNode } from "react";
import AccountSidebar from "@/components/account/AccountSidebar";

type AccountHubLayoutProps = {
  children: ReactNode;
};

export default function AccountHubLayout({ children }: AccountHubLayoutProps) {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)] md:items-start md:gap-6">
        <AccountSidebar />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

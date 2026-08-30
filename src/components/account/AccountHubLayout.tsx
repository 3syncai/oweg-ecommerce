"use client";

import type { ReactNode } from "react";
import AccountSidebar from "@/components/account/AccountSidebar";

type AccountHubLayoutProps = {
  children: ReactNode;
};

export default function AccountHubLayout({ children }: AccountHubLayoutProps) {
  return (
    <div className="oweg-container py-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(200px,240px)_minmax(0,1fr)] md:items-start md:gap-6">
        <AccountSidebar />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

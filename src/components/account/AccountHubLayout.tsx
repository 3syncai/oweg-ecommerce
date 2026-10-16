"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AccountSidebar from "@/components/account/AccountSidebar";
import styles from "./AccountOverview.module.css";

type AccountHubLayoutProps = {
  children: ReactNode;
};

export default function AccountHubLayout({ children }: AccountHubLayoutProps) {
  const isOverview = usePathname() === "/account";
  if (isOverview) {
    return <div className={styles.page}><div className={`oweg-container ${styles.container}`}><main className="min-w-0">{children}</main></div></div>;
  }
  return (
    <div className="oweg-container py-4 sm:py-8 lg:py-10">
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <AccountSidebar showMobileNav={!isOverview} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

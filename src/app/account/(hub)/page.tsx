"use client";

import { MobileAccountNav } from "@/components/account/AccountSidebar";
import {
  AccountWelcomeBanner,
  AccountQuickStats,
  ProfileInformationCard,
  AccountSecurityCard,
  RecentOrdersCard,
  AccountSummaryCard,
} from "@/components/account/sections";

export default function AccountDashboardPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <AccountWelcomeBanner />
      <MobileAccountNav variant="grid" />
      <AccountQuickStats />
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <ProfileInformationCard />
          <RecentOrdersCard />
          <AccountSummaryCard />
        </div>
        <AccountSecurityCard />
      </div>
    </div>
  );
}

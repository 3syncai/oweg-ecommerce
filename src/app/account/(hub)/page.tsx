"use client";

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
    <div className="space-y-4 md:space-y-6">
      <AccountWelcomeBanner />
      <AccountQuickStats />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProfileInformationCard />
        <AccountSecurityCard />
      </div>
      <RecentOrdersCard />
      <AccountSummaryCard />
    </div>
  );
}

"use client";

import styles from "@/components/account/AccountOverview.module.css";
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
    <div className={styles.overview}>
      <AccountWelcomeBanner />
      <AccountQuickStats />
      <div className={styles.contentGrid}>
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

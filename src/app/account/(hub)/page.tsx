"use client";

import styles from "@/components/account/AccountOverview.module.css";
import { useState } from "react";
import { LogOut } from "lucide-react";
import LogoutConfirmModal from "@/components/account/LogoutConfirmModal";
import {
  AccountWelcomeBanner,
  AccountQuickStats,
  ProfileInformationCard,
  AccountSecurityCard,
  RecentOrdersCard,
  AccountSummaryCard,
} from "@/components/account/sections";

export default function AccountDashboardPage() {
  const [logoutOpen, setLogoutOpen] = useState(false);
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
      <section aria-label="Account session" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Your session</h2>
          <p className="mt-1 text-xs text-slate-600">Manage your sign-in on this device.</p>
        </div>
        <button type="button" onClick={() => setLogoutOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-green-700">
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </section>
      <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </div>
  );
}

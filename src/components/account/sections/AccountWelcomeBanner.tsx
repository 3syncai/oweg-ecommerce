"use client";

import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import { useAuth } from "@/contexts/AuthProvider";
import { getCustomerDisplayName } from "@/lib/account-utils";

type AccountWelcomeBannerProps = {
  subtitle?: string;
};

export default function AccountWelcomeBanner({
  subtitle = "Manage your profile, orders, and rewards in one place.",
}: AccountWelcomeBannerProps) {
  const { customer } = useAuth();
  const name = getCustomerDisplayName(customer);

  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-4 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-[#326b29] sm:block">My account</p>
          <h1 className="break-words text-xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            <span className="mb-1 block text-xs font-medium tracking-normal text-slate-500 sm:mb-0 sm:inline sm:text-3xl sm:font-semibold sm:tracking-tight sm:text-slate-900">Welcome back,</span>{" "}
            {name}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 sm:text-sm">{subtitle}</p>
        </div>

        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-green-100 bg-green-50 sm:h-12 sm:w-12"
          aria-hidden
        >
          <AccountHubIcon
            name="profile-information"
            size={24}
            className="h-6 w-6"
          />
        </div>
      </div>
    </header>
  );
}

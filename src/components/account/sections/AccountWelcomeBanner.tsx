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
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-5 md:px-6 md:py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-[#1F2A33] md:text-2xl">
            Welcome back, {name}
          </h2>
          <p className="mt-1 text-sm text-gray-500 md:text-base">{subtitle}</p>
        </div>

        <div
          className="hidden shrink-0 items-center justify-center rounded-2xl bg-[#EAF8E7] p-4 sm:flex"
          aria-hidden
        >
          <AccountHubIcon
            name="profile-information"
            size={40}
            className="h-10 w-10"
          />
        </div>
      </div>
    </div>
  );
}

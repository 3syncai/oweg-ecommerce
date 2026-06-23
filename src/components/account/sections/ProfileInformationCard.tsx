"use client";

import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import { useAuth } from "@/contexts/AuthProvider";
import {
  formatAccountDate,
  getCustomerDisplayName,
} from "@/lib/account-utils";

type ProfileFieldProps = {
  label: string;
  value: string;
};

function ProfileField({ label, value }: ProfileFieldProps) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-[#1F2A33] md:text-base">
        {value || "—"}
      </p>
    </div>
  );
}

export default function ProfileInformationCard() {
  const { customer } = useAuth();

  const fullName = getCustomerDisplayName(customer);
  const email = customer?.email || "";
  const mobile = customer?.phone || "";
  const dateJoined = formatAccountDate(
    typeof customer?.created_at === "string" ? customer.created_at : undefined
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 md:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AccountHubIcon name="profile-information" size={22} className="h-[22px] w-[22px]" />
          <h3 className="text-base font-semibold text-[#1F2A33] md:text-lg">
            Profile Information
          </h3>
        </div>

        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400 md:text-sm"
        >
          <AccountHubIcon name="edit" size={16} className="h-4 w-4 opacity-60" />
          Edit
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ProfileField label="Full Name" value={fullName} />
        <ProfileField label="Email" value={email} />
        <ProfileField label="Mobile" value={mobile} />
        <ProfileField label="Date Joined" value={dateJoined} />
      </div>
    </div>
  );
}

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
      <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-xs font-medium leading-relaxed text-slate-900 [overflow-wrap:anywhere] sm:text-sm">
        {value || "—"}
      </dd>
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
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <AccountHubIcon name="profile-information" size={18} className="h-[18px] w-[18px]" />
          <h2 className="text-sm font-semibold text-slate-900">
            Profile Information
          </h2>
        </div>

        <button
          type="button"
          disabled
          aria-disabled="true"
          className="inline-flex min-h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-400"
        >
          <AccountHubIcon name="edit" size={16} className="h-4 w-4 opacity-60" />
          Edit
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 sm:gap-x-5 sm:gap-y-5 sm:p-5">
        <ProfileField label="Full Name" value={fullName} />
        <ProfileField label="Email" value={email} />
        <ProfileField label="Mobile" value={mobile} />
        <ProfileField label="Date Joined" value={dateJoined} />
      </dl>
    </section>
  );
}

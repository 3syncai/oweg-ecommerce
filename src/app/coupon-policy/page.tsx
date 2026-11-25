import type { Metadata } from "next";
import { PolicyPageShell } from "@/components/policies/PolicyPageShell";
import { PolicySections } from "@/components/policies/PolicySections";
import { couponPolicy } from "@/content/policies/coupon";

export default function CouponPolicyPage() {
  return (
    <PolicyPageShell
      badge={couponPolicy.badge}
      title={couponPolicy.title}
      description={couponPolicy.description}
    >
      <PolicySections document={couponPolicy} />
    </PolicyPageShell>
  );
}

export const metadata: Metadata = {
  title: "Coupon policy",
  description: "Read the terms for applying OWEG coupons and promotional discounts at checkout.",
};
